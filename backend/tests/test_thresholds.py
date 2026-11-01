"""Threshold list and update endpoints (AC-09, AC-26)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import get_session_factory
from app.models import Threshold
from app.schemas import ThresholdOut
from app.simulation import house
from app.simulation.alerts import evaluate


class _FakeEngine:
    """Records that the running engine reloaded its cached thresholds."""

    def __init__(self) -> None:
        self.calls = 0
        self.state = house.build_house(house.DEFAULT_SEED)

    async def reload_thresholds(self) -> None:
        self.calls += 1


def _stored() -> dict[str, float]:
    with get_session_factory()() as session:
        return {row.key: row.value for row in session.scalars(select(Threshold))}


def _stored_out() -> list[ThresholdOut]:
    with get_session_factory()() as session:
        rows = session.scalars(select(Threshold)).all()
    return [
        ThresholdOut(key=row.key, value=row.value, unit=row.unit, default_value=row.default_value)
        for row in rows
    ]


def test_get_returns_all_factory_thresholds_on_a_fresh_database(client: TestClient) -> None:
    response = client.get("/api/thresholds")

    assert response.status_code == 200
    body = response.json()
    expected = house.default_thresholds()
    assert [item["key"] for item in body] == [item.key for item in expected]
    assert [item["value"] for item in body] == [item.value for item in expected]
    assert [item["unit"] for item in body] == [item.unit for item in expected]
    assert [item["default_value"] for item in body] == [item.default_value for item in expected]


def test_update_persists_the_new_value_and_returns_it(client: TestClient) -> None:
    client.get("/api/thresholds")

    response = client.put("/api/thresholds/min_temperature", json={"value": 20.0})

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "key": "min_temperature",
        "value": 20.0,
        "unit": "°C",
        "default_value": 18.0,
    }
    assert _stored()["min_temperature"] == 20.0
    listed = {item["key"]: item["value"] for item in client.get("/api/thresholds").json()}
    assert listed["min_temperature"] == 20.0


def test_update_reloads_the_running_engine(app: FastAPI, client: TestClient) -> None:
    fake = _FakeEngine()
    app.state.engine = fake

    response = client.put("/api/thresholds/max_co2", json={"value": 900.0})

    assert response.status_code == 200
    assert fake.calls == 1


def test_unknown_threshold_returns_404_and_changes_nothing(
    app: FastAPI, client: TestClient
) -> None:
    client.get("/api/thresholds")
    before = _stored()
    fake = _FakeEngine()
    app.state.engine = fake

    response = client.put("/api/thresholds/max_humidity", json={"value": 70.0})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "unknown_threshold"
    assert response.json()["error"]["message"]
    assert _stored() == before
    assert fake.calls == 0


def test_out_of_range_value_returns_422_and_keeps_the_old_value(
    app: FastAPI, client: TestClient
) -> None:
    client.get("/api/thresholds")
    before = _stored()
    fake = _FakeEngine()
    app.state.engine = fake

    response = client.put("/api/thresholds/min_temperature", json={"value": 50.0})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["message"]
    assert _stored() == before
    assert fake.calls == 0


def test_invalid_payload_returns_422_and_changes_nothing(client: TestClient) -> None:
    client.get("/api/thresholds")
    before = _stored()

    extra_field = client.put("/api/thresholds/max_power", json={"value": 4000.0, "unit": "kW"})
    wrong_type = client.put("/api/thresholds/max_power", json={"value": "viel"})

    assert extra_field.status_code == 422
    assert wrong_type.status_code == 422
    assert extra_field.json()["error"]["code"] == "validation_error"
    assert _stored() == before


def test_changed_threshold_produces_the_next_message_with_the_new_value(
    client: TestClient,
) -> None:
    client.get("/api/thresholds")
    state = house.build_house(house.DEFAULT_SEED)
    room = next(room for room in state.rooms if room.id == "living_room")
    room.sensors.temperature = 19.0

    unchanged = evaluate(state, _stored_out(), state.sim_time)
    assert [message for message in unchanged if message.kind == "room_cold"] == []

    client.put("/api/thresholds/min_temperature", json={"value": 20.0})

    messages = evaluate(state, _stored_out(), state.sim_time)
    cold = [
        message
        for message in messages
        if message.kind == "room_cold" and message.room_id == "living_room"
    ]
    assert len(cold) == 1
    assert "20,0" in cold[0].text
    assert "19,0" in cold[0].text
