"""Manual event triggers (AC-07, AC-26).

Every event type must change the running simulation measurably, produce a
German message with timestamp, room and severity, and touch only the room it
names. Rejected calls leave both the simulation state and SQLite untouched.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import get_session_factory
from app.models import Message as MessageRow
from app.schemas import HouseState


def _message_count() -> int:
    session = get_session_factory()()
    try:
        return int(session.scalar(select(func.count()).select_from(MessageRow)) or 0)
    finally:
        session.close()


def _room_by_id(state: dict[str, Any], room_id: str) -> dict[str, Any]:
    return next(room for room in state["rooms"] if room["id"] == room_id)


def _device(room: dict[str, Any], device_type: str) -> dict[str, Any]:
    return next(device for device in room["devices"] if device["type"] == device_type)


def _before(app: FastAPI) -> HouseState:
    return app.state.engine.state.model_copy(deep=True)


def _other_rooms_unchanged(state: dict[str, Any], before: HouseState, room_id: str) -> None:
    for room in state["rooms"]:
        if room["id"] == room_id:
            continue
        previous = next(item for item in before.rooms if item.id == room["id"])
        assert room["sensors"] == previous.sensors.model_dump()
        assert room["devices"] == [device.model_dump() for device in previous.devices]
        assert room["status_text"] == previous.status_text


@pytest.mark.parametrize(
    "event_type",
    ["forgotten_window", "water_damage", "power_spike", "smoke_alarm", "occupant_rush"],
)
def test_every_event_type_is_accepted(client: TestClient, event_type: str) -> None:
    response = client.post(f"/api/events/{event_type}", json={})

    assert response.status_code == 201
    body = response.json()
    message = body["message"]
    assert message["id"]
    assert message["severity"] in {"info", "warning", "critical"}
    assert message["text"]
    assert message["created_at"] == body["state"]["sim_time"]
    assert message["acknowledged_at"] is None


def test_forgotten_window_cools_only_the_named_room(client: TestClient, app: FastAPI) -> None:
    before = _before(app)
    before_room = next(room for room in before.rooms if room.id == "bedroom")

    response = client.post("/api/events/forgotten_window", json={"room_id": "bedroom"})

    assert response.status_code == 201
    body = response.json()
    message = body["message"]
    assert message["kind"] == "room_cold"
    assert message["severity"] == "warning"
    assert message["room_id"] == "bedroom"
    assert message["room_name"] == "Schlafzimmer"

    room = _room_by_id(body["state"], "bedroom")
    assert room["sensors"]["window_open"] is True
    assert room["sensors"]["temperature"] <= before_room.sensors.temperature - 0.5
    assert "Fenster offen" in room["status_text"]
    _other_rooms_unchanged(body["state"], before, "bedroom")


def test_water_damage_is_critical_and_wets_only_its_room(client: TestClient, app: FastAPI) -> None:
    before = _before(app)
    before_room = next(room for room in before.rooms if room.id == "bathroom")

    response = client.post("/api/events/water_damage", json={"room_id": "bathroom"})

    assert response.status_code == 201
    body = response.json()
    message = body["message"]
    assert message["kind"] == "water"
    assert message["severity"] == "critical"
    assert message["room_id"] == "bathroom"
    assert message["room_name"] == "Badezimmer"

    room = _room_by_id(body["state"], "bathroom")
    assert room["sensors"]["water"] is True
    assert room["sensors"]["humidity"] >= before_room.sensors.humidity + 5.0
    assert "Wasserschaden" in room["status_text"]
    assert _device(room, "heating")["is_on"] is False
    _other_rooms_unchanged(body["state"], before, "bathroom")


def test_power_spike_raises_power_measurably(client: TestClient, app: FastAPI) -> None:
    before = _before(app)
    before_room = next(room for room in before.rooms if room.id == "kitchen")

    response = client.post("/api/events/power_spike", json={"room_id": "kitchen"})

    assert response.status_code == 201
    body = response.json()
    message = body["message"]
    assert message["kind"] == "power_spike"
    assert message["severity"] == "critical"
    assert message["room_id"] == "kitchen"

    room = _room_by_id(body["state"], "kitchen")
    assert room["sensors"]["power_w"] >= before_room.sensors.power_w + 1000.0
    device_power = sum(device["power_w"] for device in room["devices"])
    assert device_power == pytest.approx(room["sensors"]["power_w"], abs=0.5)
    _other_rooms_unchanged(body["state"], before, "kitchen")


def test_smoke_alarm_sets_off_the_smoke_detector(client: TestClient, app: FastAPI) -> None:
    before = _before(app)
    before_room = next(room for room in before.rooms if room.id == "kitchen")

    response = client.post("/api/events/smoke_alarm", json={"room_id": "kitchen"})

    assert response.status_code == 201
    body = response.json()
    message = body["message"]
    assert message["kind"] == "smoke"
    assert message["severity"] == "critical"
    assert message["room_id"] == "kitchen"

    room = _room_by_id(body["state"], "kitchen")
    assert room["sensors"]["smoke"] is True
    assert room["status_text"] == "Rauchmelder ausgelöst"
    assert room["sensors"]["co2"] > before_room.sensors.co2
    assert _device(room, "heating")["is_on"] is False
    _other_rooms_unchanged(body["state"], before, "kitchen")


def test_occupant_rush_in_one_room_stays_there(client: TestClient, app: FastAPI) -> None:
    before = _before(app)

    response = client.post("/api/events/occupant_rush", json={"room_id": "childrens_room"})

    assert response.status_code == 201
    body = response.json()
    assert body["message"]["room_id"] == "childrens_room"
    assert body["message"]["severity"] == "info"

    room = _room_by_id(body["state"], "childrens_room")
    assert room["sensors"]["motion"] is True
    assert _device(room, "light")["is_on"] is True
    _other_rooms_unchanged(body["state"], before, "childrens_room")


def test_occupant_rush_without_room_touches_the_whole_house(
    client: TestClient, app: FastAPI
) -> None:
    response = client.post("/api/events/occupant_rush", json={})

    assert response.status_code == 201
    body = response.json()
    assert body["message"]["room_id"] is None
    assert body["message"]["room_name"] is None
    assert all(room["sensors"]["motion"] is True for room in body["state"]["rooms"])


def test_event_without_body_uses_the_default_room(client: TestClient) -> None:
    response = client.post("/api/events/water_damage")

    assert response.status_code == 201
    body = response.json()
    assert body["message"]["room_id"] == "bathroom"
    room = _room_by_id(body["state"], "bathroom")
    assert room["sensors"]["water"] is True


def test_message_is_stored_and_state_kept_in_the_engine(client: TestClient, app: FastAPI) -> None:
    count = _message_count()

    response = client.post("/api/events/water_damage", json={"room_id": "bathroom"})

    assert response.status_code == 201
    message = response.json()["message"]
    assert _message_count() == count + 1
    engine_room = next(room for room in app.state.engine.state.rooms if room.id == "bathroom")
    assert engine_room.sensors.water is True

    session = get_session_factory()()
    try:
        stored = session.get(MessageRow, message["id"])
    finally:
        session.close()
    assert stored is not None
    assert stored.kind == "water"
    assert stored.severity == "critical"
    assert stored.room_id == "bathroom"
    assert stored.text == message["text"]
    assert stored.created_at == message["created_at"]
    assert stored.acknowledged_at is None


def test_unknown_event_type_is_rejected_without_side_effects(
    client: TestClient, app: FastAPI
) -> None:
    before = app.state.engine.state.model_dump()
    count = _message_count()

    response = client.post("/api/events/shutdown", json={"room_id": "kitchen"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "unknown_event_type"
    assert app.state.engine.state.model_dump() == before
    assert _message_count() == count


def test_unknown_room_is_rejected_without_side_effects(client: TestClient, app: FastAPI) -> None:
    before = app.state.engine.state.model_dump()
    count = _message_count()

    response = client.post("/api/events/water_damage", json={"room_id": "garage"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "unknown_room"
    assert app.state.engine.state.model_dump() == before
    assert _message_count() == count


@pytest.mark.parametrize(
    "payload",
    [
        {"room_id": "kitchen", "force": True},
        {"room_id": 5},
        {"room_id": ["kitchen"]},
    ],
)
def test_invalid_body_is_rejected_without_side_effects(
    client: TestClient, app: FastAPI, payload: dict[str, Any]
) -> None:
    before = app.state.engine.state.model_dump()
    count = _message_count()

    response = client.post("/api/events/smoke_alarm", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert app.state.engine.state.model_dump() == before
    assert _message_count() == count
