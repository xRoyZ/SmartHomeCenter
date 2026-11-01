"""Full reset restores the initial state (AC-12, AC-26)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import get_session_factory, session_scope
from app.models import Automation, AutomationLog, Message, Reading, Threshold
from app.simulation import house

RESET_URL = "/api/simulation/reset"


def _count(model: type) -> int:
    with get_session_factory()() as session:
        return int(session.scalar(select(func.count()).select_from(model)) or 0)


def _add_rows() -> None:
    with session_scope() as session:
        session.add(
            Message(
                id="test_message",
                kind="smoke",
                severity="critical",
                room_id=None,
                text="Rauchmelder ausgelöst.",
                created_at="2026-06-15T15:45:00",
            )
        )
        session.add(
            Reading(
                room_id="living_room",
                metric="temperature",
                value=20.0,
                sim_time="2026-06-15T15:45:00",
            )
        )
        session.add(
            Automation(
                id="custom_automation",
                name="Eigene Automation",
                enabled=True,
                condition_type="window_open",
                condition_room_id="living_room",
                condition_value=None,
                condition_time=None,
                action_type="light_on",
                action_room_id="hallway",
                action_device_id=None,
                action_value=None,
                notify=False,
                created_at="2026-06-15T15:45:00",
            )
        )
        session.add(
            AutomationLog(
                id="test_execution",
                automation_id="custom_automation",
                sim_time="2026-06-15T15:45:00",
                text="Automation ausgeführt.",
            )
        )
        session.add(
            Threshold(
                key="max_co2",
                value=777.0,
                unit="ppm",
                default_value=1000.0,
            )
        )


def _dirty_engine(client: TestClient) -> None:
    engine = client.app.state.engine
    state = engine.state
    state.sim_time = "2026-06-15T15:45:00"
    state.tick = 999
    state.paused = True
    state.speed = 300
    state.rooms[0].sensors.temperature = 5.0
    state.rooms[0].devices[1].is_on = True
    engine.settings = engine.settings.model_copy(
        update={
            "speed": 300,
            "paused": True,
            "sim_time": state.sim_time,
            "seed": 7,
            "weather": "storm",
        }
    )


def test_reset_restores_house_messages_and_history(client: TestClient) -> None:
    _dirty_engine(client)
    _add_rows()

    response = client.post(
        RESET_URL,
        json={"reset_automations": False, "reset_thresholds": False},
    )

    assert response.status_code == 200
    body = response.json()
    state = body["state"]
    assert state["sim_time"] == house.DEFAULT_START_TIME
    assert state["weekday"] == house.DEFAULT_WEEKDAY
    assert state["tick"] == 0
    assert state["open_messages"] == 0
    assert len(state["rooms"]) == len(house.ROOM_DEFINITIONS)

    initial = house.build_house(house.DEFAULT_SEED)
    for room, initial_room in zip(state["rooms"], initial.rooms, strict=True):
        assert room["id"] == initial_room.id
        for device, initial_device in zip(room["devices"], initial_room.devices, strict=True):
            assert device["is_on"] == initial_device.is_on
            assert device["level"] == initial_device.level
            assert device["target_temp"] == initial_device.target_temp

    assert body["settings"] == house.initial_settings().model_dump()
    assert client.app.state.engine.state.sim_time == house.DEFAULT_START_TIME

    assert _count(Message) == 0
    assert _count(Reading) == 0
    assert _count(AutomationLog) == 0
    # Without the optional flags the user's automation and threshold stay.
    assert _count(Automation) == 1
    with get_session_factory()() as session:
        threshold = session.get(Threshold, "max_co2")
        assert threshold is not None
        assert abs(threshold.value - 777.0) < 1e-6


def test_reset_can_restore_automations_and_thresholds(client: TestClient) -> None:
    _dirty_engine(client)
    _add_rows()

    response = client.post(
        RESET_URL,
        json={"reset_automations": True, "reset_thresholds": True},
    )

    assert response.status_code == 200
    assert _count(Message) == 0
    assert _count(Reading) == 0
    assert _count(AutomationLog) == 0

    defaults = house.default_automations()
    assert _count(Automation) == len(defaults)
    with get_session_factory()() as session:
        names = set(session.scalars(select(Automation.name)).all())
    assert names == {automation.name for automation in defaults}

    expected_thresholds = {
        threshold.key: threshold.value for threshold in house.default_thresholds()
    }
    with get_session_factory()() as session:
        stored = {row.key: row.value for row in session.scalars(select(Threshold)).all()}
    assert set(stored) == set(expected_thresholds)
    for key, value in expected_thresholds.items():
        assert abs(stored[key] - value) < 1e-6


def test_rejected_reset_changes_nothing(client: TestClient) -> None:
    _add_rows()
    before_state = client.app.state.engine.state.model_dump()
    before_messages = _count(Message)
    before_readings = _count(Reading)
    before_automations = _count(Automation)

    missing_field = client.post(RESET_URL, json={"reset_automations": True})
    assert missing_field.status_code == 422
    assert missing_field.json()["error"]["code"] == "validation_error"

    unknown_field = client.post(
        RESET_URL,
        json={"reset_automations": True, "reset_thresholds": True, "wipe": True},
    )
    assert unknown_field.status_code == 422
    assert unknown_field.json()["error"]["code"] == "validation_error"

    assert client.app.state.engine.state.model_dump() == before_state
    assert _count(Message) == before_messages
    assert _count(Reading) == before_readings
    assert _count(Automation) == before_automations
