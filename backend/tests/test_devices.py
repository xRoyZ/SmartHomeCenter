"""Device detail and device control endpoints (contract ``DeviceDetail``)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import get_session_factory
from app.models import Automation, Device, Message, Threshold
from app.schemas import HistorySeries

_UNITS = {"temperature": "°C", "humidity": "%", "co2": "ppm", "power": "W"}


@pytest.fixture()
def series_calls(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, str]]:
    """Replace the sibling history query with a recorder so this slice is testable alone."""

    calls: list[tuple[str, str, str]] = []

    def fake_query(session, room_id: str, metric: str, window: str) -> HistorySeries:
        calls.append((room_id, metric, window))
        return HistorySeries(
            room_id=room_id,
            metric=metric,
            window=window,
            unit=_UNITS[metric],
            points=[],
        )

    from app.simulation import history as history_module

    monkeypatch.setattr(history_module, "query", fake_query)
    return calls


def _device(app, device_id: str):
    for room in app.state.engine.state.rooms:
        for device in room.devices:
            if device.id == device_id:
                return room, device
    raise AssertionError(f"device {device_id} not in the running house")


def _row_counts() -> dict[str, int]:
    """Count the tables a device command must never write to.

    ``readings`` is deliberately not counted: the ticking simulation records them
    independently of any command, so it says nothing about a rejected request.
    """

    factory = get_session_factory()
    with factory() as session:
        return {
            "messages": session.scalar(select(func.count()).select_from(Message)),
            "devices": session.scalar(select(func.count()).select_from(Device)),
            "automations": session.scalar(select(func.count()).select_from(Automation)),
            "thresholds": session.scalar(select(func.count()).select_from(Threshold)),
        }


def test_device_detail_returns_room_name_and_recent_series(
    client: TestClient, series_calls: list[tuple[str, str, str]]
) -> None:
    response = client.get("/api/devices/living_room_heating")

    assert response.status_code == 200
    body = response.json()
    assert body["device"]["id"] == "living_room_heating"
    assert body["device"]["type"] == "heating"
    assert body["room_name"] == "Wohnzimmer"
    assert body["last_action"] is None
    assert {series["metric"] for series in body["series"]} == {
        "temperature",
        "humidity",
        "co2",
        "power",
    }
    assert all(call[0] == "living_room" and call[2] == "15m" for call in series_calls)
    assert {call[1] for call in series_calls} == {"temperature", "humidity", "co2", "power"}


def test_device_detail_is_reachable_without_history_recording(client: TestClient) -> None:
    response = client.get("/api/devices/living_room_heating")

    assert response.status_code == 200
    body = response.json()
    assert body["device"]["id"] == "living_room_heating"
    assert len(body["series"]) == 4


def test_unknown_device_detail_answers_unknown_device(client: TestClient) -> None:
    response = client.get("/api/devices/attic_fan")

    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "unknown_device"
    assert "nicht gefunden" in body["error"]["message"]


def test_shutter_level_is_applied_to_the_running_simulation(
    client: TestClient, app, series_calls
) -> None:
    response = client.put("/api/devices/living_room_shutter/state", json={"level": 35})

    assert response.status_code == 200
    body = response.json()
    assert body["device"]["level"] == 35
    assert body["device"]["is_on"] is False
    assert "35" in body["device"]["state_text"]

    _, device = _device(app, "living_room_shutter")
    assert device.level == 35

    detail = client.get("/api/rooms/living_room").json()
    shutter = next(item for item in detail["devices"] if item["id"] == "living_room_shutter")
    assert shutter["level"] == 35


def test_shutter_level_above_range_is_rejected_without_side_effect(
    client: TestClient, app, series_calls
) -> None:
    _, before = _device(app, "living_room_shutter")
    counts_before = _row_counts()

    response = client.put("/api/devices/living_room_shutter/state", json={"level": 150})

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "validation_error"
    assert "Ungültige" in body["error"]["message"]

    _, after = _device(app, "living_room_shutter")
    assert after.level == before.level
    assert _row_counts() == counts_before


def test_light_switches_and_sets_brightness(client: TestClient, app, series_calls) -> None:
    response = client.put("/api/devices/living_room_light/state", json={"level": 40})

    assert response.status_code == 200
    body = response.json()
    assert body["device"]["is_on"] is True
    assert body["device"]["level"] == 40
    assert body["device"]["power_w"] > 0
    room, _ = _device(app, "living_room_light")
    assert room.light_on is True

    response = client.put("/api/devices/living_room_light/state", json={"is_on": False})
    body = response.json()
    assert body["device"]["is_on"] is False
    assert body["device"]["level"] == 0
    assert body["device"]["power_w"] == 0.0
    room, _ = _device(app, "living_room_light")
    assert room.light_on is False

    response = client.put("/api/devices/living_room_light/state", json={"is_on": True})
    body = response.json()
    assert body["device"]["is_on"] is True
    assert body["device"]["level"] == 100


def test_heating_target_temperature_applies_and_updates_room_state(
    client: TestClient, app, series_calls
) -> None:
    response = client.put("/api/devices/living_room_heating/state", json={"target_temp": 24.0})

    assert response.status_code == 200
    body = response.json()
    assert body["device"]["target_temp"] == pytest.approx(24.0)
    assert body["device"]["is_on"] is True
    room, device = _device(app, "living_room_heating")
    assert room.heating_active is True
    assert "heizt" in device.state_text.lower()

    response = client.put("/api/devices/living_room_heating/state", json={"target_temp": 10.0})
    body = response.json()
    assert body["device"]["target_temp"] == pytest.approx(10.0)
    assert body["device"]["is_on"] is True
    assert body["device"]["power_w"] == 0.0
    room, device = _device(app, "living_room_heating")
    assert room.heating_active is False


def test_a_setpoint_below_the_room_temperature_heats_once_the_room_cools(
    client: TestClient, app, series_calls
) -> None:
    from random import Random

    from app.simulation.physics import step_physics

    response = client.put("/api/devices/living_room_heating/state", json={"target_temp": 18.0})
    assert response.status_code == 200

    engine = app.state.engine
    room, device = _device(app, "living_room_heating")
    room.sensors.temperature = 15.0
    room.sensors.window_open = False
    step_physics(engine.state, Random(1), 1)

    room, device = _device(app, "living_room_heating")
    assert device.is_on is True
    assert device.power_w > 0.0
    assert room.heating_active is True


def test_heating_target_outside_range_is_rejected_without_side_effect(
    client: TestClient, app, series_calls
) -> None:
    _, before = _device(app, "living_room_heating")

    response = client.put("/api/devices/living_room_heating/state", json={"target_temp": 35.0})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    _, after = _device(app, "living_room_heating")
    assert after.target_temp == before.target_temp


def test_plug_and_appliance_switch_their_power(client: TestClient, app, series_calls) -> None:
    response = client.put("/api/devices/living_room_tv/state", json={"is_on": True})
    body = response.json()
    assert body["device"]["is_on"] is True
    assert body["device"]["power_w"] == pytest.approx(120.0)

    response = client.put("/api/devices/living_room_tv/state", json={"is_on": False})
    assert response.json()["device"]["power_w"] == 0.0

    response = client.put("/api/devices/bathroom_washer/state", json={"is_on": True})
    body = response.json()
    assert body["device"]["is_on"] is True
    assert body["device"]["power_w"] == pytest.approx(1200.0)
    room, _ = _device(app, "bathroom_washer")
    assert room.sensors.power_w > 0


@pytest.mark.parametrize(
    ("device_id", "payload"),
    [
        ("living_room_heating", {"level": 50}),
        ("living_room_shutter", {"is_on": True}),
        ("living_room_tv", {"level": 20}),
        ("bathroom_washer", {"target_temp": 22.0}),
    ],
)
def test_device_type_rejects_unsupported_fields(
    client: TestClient, series_calls, device_id: str, payload: dict
) -> None:
    response = client.put(f"/api/devices/{device_id}/state", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_empty_command_is_rejected(client: TestClient, series_calls) -> None:
    response = client.put("/api/devices/living_room_light/state", json={})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


@pytest.mark.parametrize(
    ("device_id", "payload"),
    [
        ("living_room_light", {"level": -1}),
        ("living_room_light", {"level": 101}),
        ("living_room_shutter", {"level": -1}),
        ("living_room_shutter", {"level": 101}),
        ("living_room_heating", {"target_temp": 4.9}),
        ("living_room_heating", {"target_temp": 30.1}),
    ],
)
def test_values_outside_the_contract_ranges_are_rejected(
    client: TestClient, series_calls, device_id: str, payload: dict
) -> None:
    response = client.put(f"/api/devices/{device_id}/state", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["message"]


@pytest.mark.parametrize(
    ("device_id", "payload", "field", "expected"),
    [
        ("living_room_shutter", {"level": 0}, "level", 0),
        ("living_room_shutter", {"level": 100}, "level", 100),
        ("living_room_light", {"level": 0}, "level", 0),
        ("living_room_light", {"level": 100}, "level", 100),
        ("living_room_heating", {"target_temp": 5.0}, "target_temp", 5.0),
        ("living_room_heating", {"target_temp": 30.0}, "target_temp", 30.0),
    ],
)
def test_range_boundaries_are_accepted(
    client: TestClient,
    series_calls,
    device_id: str,
    payload: dict,
    field: str,
    expected: float,
) -> None:
    response = client.put(f"/api/devices/{device_id}/state", json=payload)

    assert response.status_code == 200
    assert response.json()["device"][field] == pytest.approx(expected)


def test_unknown_device_command_is_rejected_without_side_effect(
    client: TestClient, app, series_calls
) -> None:
    counts_before = _row_counts()

    response = client.put("/api/devices/attic_fan/state", json={"is_on": True})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "unknown_device"
    assert _row_counts() == counts_before


def test_accepted_command_records_the_last_action(client: TestClient, app, series_calls) -> None:
    client.put("/api/devices/living_room_light/state", json={"is_on": True})

    body = client.get("/api/devices/living_room_light").json()

    assert body["last_action"] is not None
    assert body["last_action"]["sim_time"] == app.state.engine.state.sim_time
    assert body["last_action"]["text"]


def test_command_is_broadcast_to_connected_clients(client: TestClient, series_calls) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"

        response = client.put("/api/devices/living_room_light/state", json={"is_on": True})
        assert response.status_code == 200

        message = websocket.receive_json()
        assert message["type"] == "snapshot"
        devices = [device for room in message["payload"]["rooms"] for device in room["devices"]]
        light = next(device for device in devices if device["id"] == "living_room_light")
        assert light["is_on"] is True


def test_rejected_command_is_not_broadcast(
    client: TestClient, series_calls: list[tuple[str, str, str]]
) -> None:
    with client.websocket_connect("/ws") as websocket:
        assert websocket.receive_json()["type"] == "snapshot"

        response = client.put("/api/devices/living_room_shutter/state", json={"level": 150})
        assert response.status_code == 422

        # The next message must be the snapshot caused by the accepted command.
        client.put("/api/devices/living_room_shutter/state", json={"level": 20})
        message = websocket.receive_json()
        assert message["type"] == "snapshot"
        shutter = next(
            device
            for room in message["payload"]["rooms"]
            for device in room["devices"]
            if device["id"] == "living_room_shutter"
        )
        assert shutter["level"] == 20
