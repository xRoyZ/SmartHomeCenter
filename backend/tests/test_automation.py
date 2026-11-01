"""Automation evaluation: firing, logging and disabled rules (AC-06)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import get_session_factory
from app.models import AutomationLog, Message
from app.schemas import ActionInput, ApiError, AutomationOut, ConditionInput, HouseState
from app.simulation import house
from app.simulation.automation import evaluate, validate_automation

CREATED_AT = "2026-06-15T08:00:00"


def _automation(
    *,
    automation_id: str = "rule-window",
    enabled: bool = True,
    notify: bool = True,
    condition: ConditionInput | None = None,
    action: ActionInput | None = None,
) -> AutomationOut:
    return AutomationOut(
        id=automation_id,
        name="Lüften stoppt Heizung",
        enabled=enabled,
        condition=condition or ConditionInput(type="window_open", room_id="living_room"),
        action=action
        or ActionInput(
            type="heating_off",
            room_id="living_room",
            device_id="living_room_heating",
        ),
        notify=notify,
        created_at=CREATED_AT,
    )


def _room(state: HouseState, room_id: str):
    return next(room for room in state.rooms if room.id == room_id)


def _heating(state: HouseState, room_id: str):
    room = _room(state, room_id)
    return next(device for device in room.devices if device.type == "heating")


def _device_by_id(state: HouseState, device_id: str):
    for room in state.rooms:
        for device in room.devices:
            if device.id == device_id:
                return device
    raise AssertionError(f"device {device_id} not in state")


def _log_rows() -> list[AutomationLog]:
    with get_session_factory()() as session:
        return list(session.scalars(select(AutomationLog)))


def _message_rows() -> list[Message]:
    with get_session_factory()() as session:
        return list(session.scalars(select(Message)))


def test_open_window_turns_heating_off_and_logs_execution(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True
    heating = _heating(state, "living_room")
    assert heating.is_on is True

    executions = evaluate(state, [_automation()], state.sim_time)

    assert len(executions) == 1
    execution = executions[0]
    assert execution.automation_id == "rule-window"
    assert execution.automation_name == "Lüften stoppt Heizung"
    assert execution.sim_time == state.sim_time
    assert "Heizung" in execution.text

    heating = _heating(state, "living_room")
    assert heating.is_on is False
    assert heating.power_w == 0.0
    assert _room(state, "living_room").heating_active is False

    logs = _log_rows()
    assert [row.automation_id for row in logs] == ["rule-window"]
    assert logs[0].sim_time == state.sim_time
    assert logs[0].text == execution.text

    messages = _message_rows()
    assert len(messages) == 1
    assert messages[0].kind == "automation"
    assert messages[0].room_id == "living_room"
    assert "Lüften stoppt Heizung" in messages[0].text
    assert messages[0].created_at == state.sim_time


def test_disabled_rule_does_not_fire(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True

    executions = evaluate(state, [_automation(enabled=False)], state.sim_time)

    assert executions == []
    assert _heating(state, "living_room").is_on is True
    assert _log_rows() == []
    assert _message_rows() == []


def test_rule_without_notify_logs_without_message(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True

    executions = evaluate(state, [_automation(notify=False)], state.sim_time)

    assert len(executions) == 1
    assert len(_log_rows()) == 1
    assert _message_rows() == []


def test_still_true_condition_does_not_repeat_log_or_message(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True
    rule = _automation()

    first = evaluate(state, [rule], state.sim_time)
    second = evaluate(state, [rule], state.sim_time)

    assert len(first) == 1
    assert second == []
    assert len(_log_rows()) == 1
    assert len(_message_rows()) == 1


def test_condition_false_does_not_fire(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = False

    executions = evaluate(state, [_automation()], state.sim_time)

    assert executions == []
    assert _heating(state, "living_room").is_on is True
    assert _log_rows() == []


def test_temperature_below_fires_heating_set(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "bedroom").sensors.temperature = 17.0
    rule = _automation(
        condition=ConditionInput(type="temperature_below", room_id="bedroom", value=18.0),
        action=ActionInput(
            type="heating_set",
            room_id="bedroom",
            device_id="bedroom_heating",
            value=21.5,
        ),
    )

    executions = evaluate(state, [rule], state.sim_time)

    assert len(executions) == 1
    heating = _heating(state, "bedroom")
    assert heating.target_temp == 21.5
    assert heating.is_on is True
    assert heating.power_w == 700.0
    assert _room(state, "bedroom").heating_active is True
    assert "21.5" in executions[0].text


def test_temperature_above_fires_shutter_close(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "kitchen").sensors.temperature = 26.0
    rule = _automation(
        condition=ConditionInput(type="temperature_above", room_id="kitchen", value=25.0),
        action=ActionInput(
            type="shutter_close",
            room_id="kitchen",
            device_id="kitchen_shutter",
        ),
    )

    executions = evaluate(state, [rule], state.sim_time)

    assert len(executions) == 1
    shutter = _device_by_id(state, "kitchen_shutter")
    assert shutter.level == 0
    assert shutter.state_text == "Rollladen geschlossen"


def test_temperature_condition_below_threshold_does_not_fire(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "kitchen").sensors.temperature = 21.0
    rule = _automation(
        condition=ConditionInput(type="temperature_above", room_id="kitchen", value=25.0),
        action=ActionInput(type="shutter_close", room_id="kitchen"),
    )

    assert evaluate(state, [rule], state.sim_time) == []
    assert _device_by_id(state, "kitchen_shutter").level == 100


def test_co2_above_fires_light_on(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "bathroom").sensors.co2 = 1200.0
    rule = _automation(
        condition=ConditionInput(type="co2_above", room_id="bathroom", value=1000.0),
        action=ActionInput(
            type="light_on",
            room_id="bathroom",
            device_id="bathroom_light",
        ),
    )

    executions = evaluate(state, [rule], state.sim_time)

    assert len(executions) == 1
    light = _device_by_id(state, "bathroom_light")
    assert light.is_on is True
    assert light.level == 100
    assert _room(state, "bathroom").light_on is True


def test_time_after_fires_light_on(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    rule = _automation(
        condition=ConditionInput(type="time_after", time="18:00"),
        action=ActionInput(
            type="light_on",
            room_id="living_room",
            device_id="living_room_light",
        ),
    )

    executions = evaluate(state, [rule], "2026-06-15T19:00:00")

    assert len(executions) == 1
    assert executions[0].sim_time == "2026-06-15T19:00:00"
    assert _device_by_id(state, "living_room_light").is_on is True


def test_time_before_fires_light_off(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    assert _device_by_id(state, "hallway_light").is_on is True
    rule = _automation(
        condition=ConditionInput(type="time_before", time="08:00"),
        action=ActionInput(
            type="light_off",
            room_id="hallway",
            device_id="hallway_light",
        ),
    )

    executions = evaluate(state, [rule], "2026-06-15T07:00:00")

    assert len(executions) == 1
    light = _device_by_id(state, "hallway_light")
    assert light.is_on is False
    assert light.level == 0
    assert _room(state, "hallway").light_on is False


def test_time_condition_outside_window_does_not_fire(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    rule = _automation(
        condition=ConditionInput(type="time_after", time="18:00"),
        action=ActionInput(
            type="light_on",
            room_id="living_room",
            device_id="living_room_light",
        ),
    )

    assert evaluate(state, [rule], "2026-06-15T08:00:00") == []
    assert _device_by_id(state, "living_room_light").is_on is False


def test_shutter_set_sets_requested_level(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True
    rule = _automation(
        action=ActionInput(
            type="shutter_set",
            room_id="living_room",
            device_id="living_room_shutter",
            value=40.0,
        ),
    )

    executions = evaluate(state, [rule], state.sim_time)

    assert len(executions) == 1
    shutter = _device_by_id(state, "living_room_shutter")
    assert shutter.level == 40
    assert shutter.state_text == "Rollladen 40 % offen"


def test_plug_off_turns_plug_off(client: TestClient) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    _room(state, "living_room").sensors.window_open = True
    plug = _device_by_id(state, "living_room_tv")
    plug.is_on = True
    plug.power_w = 120.0
    rule = _automation(
        action=ActionInput(
            type="plug_off",
            room_id="living_room",
            device_id="living_room_tv",
        ),
    )

    executions = evaluate(state, [rule], state.sim_time)

    assert len(executions) == 1
    assert plug.is_on is False
    assert plug.power_w == 0.0
    assert plug.state_text == "Steckdose aus"


def test_validate_automation_rejects_shutter_level_out_of_range() -> None:
    state = house.build_house(house.DEFAULT_SEED)
    rule = _automation(
        condition=ConditionInput(type="window_open", room_id="kitchen"),
        action=ActionInput(
            type="shutter_set",
            room_id="kitchen",
            device_id="kitchen_shutter",
            value=150.0,
        ),
    )

    try:
        validate_automation(state, rule)
    except ApiError as error:
        assert error.status_code == 422
        assert error.code == "validation_error"
        assert error.message
    else:  # pragma: no cover - the validation must reject this rule
        raise AssertionError("shutter level 150 % must be rejected")
