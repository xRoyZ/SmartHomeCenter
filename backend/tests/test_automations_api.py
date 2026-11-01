"""Automation CRUD, validation and the execution log (AC-06, AC-21, AC-26)."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.schemas import AutomationOut, HouseState
from app.simulation import house
from app.simulation.automation import evaluate

BASE = "/api/automations"


def _payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Lüften stoppt Heizung",
        "enabled": True,
        "condition": {"type": "window_open", "room_id": "living_room"},
        "action": {
            "type": "heating_off",
            "room_id": "living_room",
            "device_id": "living_room_heating",
        },
        "notify": True,
    }
    payload.update(overrides)
    return payload


def _room(state: HouseState, room_id: str):
    return next(room for room in state.rooms if room.id == room_id)


def test_create_list_update_and_delete(client: TestClient) -> None:
    created = client.post(BASE, json=_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["id"]
    assert body["name"] == "Lüften stoppt Heizung"
    assert body["condition"] == {
        "type": "window_open",
        "room_id": "living_room",
        "value": None,
        "time": None,
    }
    assert body["action"]["device_id"] == "living_room_heating"
    automation_id = body["id"]

    listed = client.get(BASE)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [automation_id]

    updated = client.put(
        f"{BASE}/{automation_id}",
        json=_payload(name="Heizung aus bei offenem Fenster", enabled=False),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Heizung aus bei offenem Fenster"
    assert updated.json()["enabled"] is False
    assert client.get(BASE).json()[0]["name"] == "Heizung aus bei offenem Fenster"

    deleted = client.delete(f"{BASE}/{automation_id}")
    assert deleted.status_code == 204
    assert client.get(BASE).json() == []


def test_execution_log_returns_the_performed_action(client: TestClient) -> None:
    created = client.post(BASE, json=_payload())
    assert created.status_code == 201
    automation = AutomationOut.model_validate(created.json())

    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True
    executions = evaluate(state, [automation], state.sim_time)
    assert len(executions) == 1

    response = client.get(f"{BASE}/{automation.id}/executions")
    assert response.status_code == 200
    log = response.json()
    assert len(log) == 1
    assert log[0]["automation_id"] == automation.id
    assert log[0]["automation_name"] == "Lüften stoppt Heizung"
    assert log[0]["sim_time"] == state.sim_time
    assert log[0]["text"]


def test_unknown_automation_answers_unknown_automation(client: TestClient) -> None:
    assert client.put(f"{BASE}/missing", json=_payload()).status_code == 404
    assert client.delete(f"{BASE}/missing").status_code == 404
    assert client.get(f"{BASE}/missing/executions").status_code == 404

    for response in (
        client.put(f"{BASE}/missing", json=_payload()),
        client.delete(f"{BASE}/missing"),
        client.get(f"{BASE}/missing/executions"),
    ):
        assert response.json()["error"]["code"] == "unknown_automation"


def test_invalid_shutter_level_is_rejected_without_storing(client: TestClient) -> None:
    payload = _payload(
        condition={"type": "window_open", "room_id": "kitchen"},
        action={
            "type": "shutter_set",
            "room_id": "kitchen",
            "device_id": "kitchen_shutter",
            "value": 150,
        },
    )
    state_before = client.app.state.engine.state.model_dump()

    response = client.post(BASE, json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["message"]
    assert client.get(BASE).json() == []
    assert client.app.state.engine.state.model_dump() == state_before


def test_unknown_device_and_room_are_rejected(client: TestClient) -> None:
    unknown_device = _payload(
        action={
            "type": "heating_off",
            "room_id": "living_room",
            "device_id": "does_not_exist",
        }
    )
    unknown_room = _payload(
        condition={"type": "temperature_below", "room_id": "attic", "value": 18.0}
    )

    for payload in (unknown_device, unknown_room):
        response = client.post(BASE, json=payload)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"

    assert client.get(BASE).json() == []


def test_incomplete_automation_is_rejected(client: TestClient) -> None:
    response = client.post(BASE, json={"name": "Unvollständig", "enabled": True})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert client.get(BASE).json() == []


def test_rejected_update_keeps_the_stored_automation(client: TestClient) -> None:
    created = client.post(BASE, json=_payload())
    automation_id = created.json()["id"]

    rejected = client.put(
        f"{BASE}/{automation_id}",
        json=_payload(
            action={
                "type": "light_on",
                "room_id": "living_room",
                "device_id": "living_room_heating",
            }
        ),
    )

    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "validation_error"
    stored = client.get(BASE).json()
    assert len(stored) == 1
    assert stored[0]["action"]["type"] == "heating_off"
