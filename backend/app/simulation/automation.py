"""Automation evaluation.

Every tick the engine hands the current house state and the enabled rules to
:func:`evaluate`. A rule whose condition holds performs its action on the
state, an :class:`~app.models.AutomationLog` row records the execution with the
simulated timestamp and, when the rule asks for it, a message of kind
``automation`` is stored so the message list can show it.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime

from ..db import session_scope
from ..models import AutomationLog, Message
from ..schemas import (
    ActionInput,
    ApiError,
    AutomationInput,
    AutomationOut,
    ConditionInput,
    DeviceState,
    ExecutionOut,
    HouseState,
    RoomState,
)
from .house import _status_text

ACTION_DEVICE_TYPE: dict[str, str] = {
    "heating_off": "heating",
    "heating_set": "heating",
    "light_on": "light",
    "light_off": "light",
    "shutter_close": "shutter",
    "shutter_set": "shutter",
    "plug_off": "plug",
}

MIN_TEMPERATURE = -50.0
MAX_TEMPERATURE = 60.0
MIN_CO2 = 0.0
MAX_CO2 = 10_000.0
MIN_TARGET_TEMP = 5.0
MAX_TARGET_TEMP = 30.0
MIN_SHUTTER_LEVEL = 0
MAX_SHUTTER_LEVEL = 100


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _find_room(state: HouseState, room_id: str | None) -> RoomState | None:
    if room_id is None:
        return None
    for room in state.rooms:
        if room.id == room_id:
            return room
    return None


def _find_device(state: HouseState, device_id: str) -> DeviceState | None:
    for room in state.rooms:
        for device in room.devices:
            if device.id == device_id:
                return device
    return None


def _clock(sim_time: str) -> str:
    try:
        return datetime.fromisoformat(sim_time).strftime("%H:%M")
    except ValueError:
        return sim_time[11:16]


def _check_window_condition(condition: ConditionInput, state: HouseState) -> None:
    if condition.room_id is not None and _find_room(state, condition.room_id) is None:
        raise _invalid("Der Raum der Bedingung wurde nicht gefunden.")
    if condition.value is not None:
        raise _invalid("Die Bedingung „Fenster offen“ nimmt keinen Wert an.")
    if condition.time is not None:
        raise _invalid("Die Bedingung „Fenster offen“ nimmt keine Uhrzeit an.")


def _check_temperature_condition(condition: ConditionInput, state: HouseState) -> None:
    if condition.room_id is None or _find_room(state, condition.room_id) is None:
        raise _invalid("Für die Temperaturbedingung muss ein bekannter Raum gewählt sein.")
    if condition.value is None:
        raise _invalid("Für die Temperaturbedingung fehlt der Grenzwert.")
    if not MIN_TEMPERATURE <= condition.value <= MAX_TEMPERATURE:
        raise _invalid(
            f"Der Temperaturgrenzwert muss zwischen {MIN_TEMPERATURE:.0f} "
            f"und {MAX_TEMPERATURE:.0f} °C liegen."
        )
    if condition.time is not None:
        raise _invalid("Die Temperaturbedingung nimmt keine Uhrzeit an.")


def _check_co2_condition(condition: ConditionInput, state: HouseState) -> None:
    if condition.room_id is None or _find_room(state, condition.room_id) is None:
        raise _invalid("Für die CO₂-Bedingung muss ein bekannter Raum gewählt sein.")
    if condition.value is None:
        raise _invalid("Für die CO₂-Bedingung fehlt der Grenzwert.")
    if not MIN_CO2 <= condition.value <= MAX_CO2:
        raise _invalid(
            f"Der CO₂-Grenzwert muss zwischen {MIN_CO2:.0f} und {MAX_CO2:.0f} ppm liegen."
        )
    if condition.time is not None:
        raise _invalid("Die CO₂-Bedingung nimmt keine Uhrzeit an.")


def _check_time_condition(condition: ConditionInput, state: HouseState) -> None:
    if condition.time is None:
        raise _invalid("Für die Uhrzeitbedingung fehlt die Uhrzeit.")
    if condition.room_id is not None:
        raise _invalid("Die Uhrzeitbedingung bezieht sich auf das ganze Haus.")
    if condition.value is not None:
        raise _invalid("Die Uhrzeitbedingung nimmt keinen Wert an.")


_CONDITION_CHECKS: dict[str, Callable[[ConditionInput, HouseState], None]] = {
    "window_open": _check_window_condition,
    "temperature_below": _check_temperature_condition,
    "temperature_above": _check_temperature_condition,
    "co2_above": _check_co2_condition,
    "time_after": _check_time_condition,
    "time_before": _check_time_condition,
}


def _check_condition(condition: ConditionInput, state: HouseState) -> None:
    _CONDITION_CHECKS[condition.type](condition, state)


def _validate_action_device(state: HouseState, action: ActionInput) -> None:
    expected_type = ACTION_DEVICE_TYPE[action.type]
    room = _find_room(state, action.room_id)
    if room is None:
        raise _invalid("Der Raum der Aktion wurde nicht gefunden.")

    if action.device_id is not None:
        device = _find_device(state, action.device_id)
        if device is None:
            raise _invalid("Das angegebene Gerät wurde nicht gefunden.")
        if device.room_id != room.id:
            raise _invalid("Das angegebene Gerät gehört nicht zum gewählten Raum.")
        if device.type != expected_type:
            raise _invalid("Die Aktion passt nicht zum Typ des gewählten Geräts.")
        return

    if not any(item.type == expected_type for item in room.devices):
        raise _invalid("Im gewählten Raum gibt es kein passendes Gerät für diese Aktion.")


def _validate_action_value(action: ActionInput) -> None:
    if action.type == "heating_set":
        if action.value is None:
            raise _invalid("Für „Heizung regeln“ fehlt die Zieltemperatur.")
        if not MIN_TARGET_TEMP <= action.value <= MAX_TARGET_TEMP:
            raise _invalid(
                f"Die Zieltemperatur muss zwischen {MIN_TARGET_TEMP:.0f} "
                f"und {MAX_TARGET_TEMP:.0f} °C liegen."
            )
        return
    if action.type == "shutter_set":
        if action.value is None:
            raise _invalid("Für „Rollladen stellen“ fehlt der Öffnungsgrad.")
        if not MIN_SHUTTER_LEVEL <= action.value <= MAX_SHUTTER_LEVEL:
            raise _invalid("Der Öffnungsgrad des Rollladens muss zwischen 0 und 100 % liegen.")
        return
    if action.value is not None:
        raise _invalid("Diese Aktion nimmt keinen Wert an.")


def validate_automation(state: HouseState, automation: AutomationInput) -> None:
    """Reject an automation the simulation cannot run (AC-21, AC-26).

    Everything is checked before the caller writes anything, so a rejected
    request never changes the state or the stored rules.
    """

    _check_condition(automation.condition, state)
    _validate_action_device(state, automation.action)
    _validate_action_value(automation.action)


def _condition_holds(condition: ConditionInput, state: HouseState, sim_time: str) -> bool:
    kind = condition.type
    if kind == "window_open":
        if condition.room_id is None:
            return any(room.sensors.window_open for room in state.rooms)
        room = _find_room(state, condition.room_id)
        return bool(room and room.sensors.window_open)
    if kind in ("temperature_below", "temperature_above"):
        room = _find_room(state, condition.room_id)
        if room is None or condition.value is None:
            return False
        if kind == "temperature_below":
            return room.sensors.temperature < condition.value
        return room.sensors.temperature > condition.value
    if kind == "co2_above":
        room = _find_room(state, condition.room_id)
        if room is None or condition.value is None:
            return False
        return room.sensors.co2 > condition.value
    if condition.time is None:
        return False
    clock = _clock(sim_time)
    if kind == "time_after":
        return clock >= condition.time
    if kind == "time_before":
        return clock < condition.time
    return False


def _resolve_device(state: HouseState, action: ActionInput) -> tuple[RoomState, DeviceState] | None:
    if action.device_id is not None:
        device = _find_device(state, action.device_id)
        if device is None:
            return None
        room = _find_room(state, device.room_id)
        return (room, device) if room is not None else None
    room = _find_room(state, action.room_id)
    if room is None:
        return None
    expected_type = ACTION_DEVICE_TYPE[action.type]
    device = next((item for item in room.devices if item.type == expected_type), None)
    if device is None:
        return None
    return room, device


def _apply_heating_off(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    if not device.is_on and device.power_w <= 0.0:
        return None
    device.is_on = False
    device.power_w = 0.0
    device.state_text = "Heizung aus"
    return f"Heizung in {room.name} ausgeschaltet"


def _apply_heating_set(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    value = float(action.value if action.value is not None else MIN_TARGET_TEMP)
    desired_on = value > room.sensors.temperature
    if (
        device.target_temp is not None
        and abs(device.target_temp - value) < 1e-9
        and device.is_on == desired_on
    ):
        return None
    device.target_temp = value
    device.is_on = desired_on
    device.power_w = 700.0 if desired_on else 0.0
    device.state_text = "Heizung heizt" if desired_on else "Heizung aus"
    return f"Heizung in {room.name} auf {value:.1f} °C gestellt"


def _apply_light_on(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    if device.is_on and device.level == 100:
        return None
    device.is_on = True
    device.level = 100
    device.power_w = 40.0
    device.state_text = "Licht an"
    return f"Licht in {room.name} eingeschaltet"


def _apply_light_off(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    if not device.is_on and not device.level:
        return None
    device.is_on = False
    device.level = 0
    device.power_w = 0.0
    device.state_text = "Licht aus"
    return f"Licht in {room.name} ausgeschaltet"


def _apply_shutter(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    level = 0 if action.type == "shutter_close" else round(action.value or 0.0)
    level = max(MIN_SHUTTER_LEVEL, min(MAX_SHUTTER_LEVEL, level))
    if device.level == level and not device.is_on:
        return None
    device.is_on = False
    device.level = level
    if level == 0:
        device.state_text = "Rollladen geschlossen"
        return f"Rollladen in {room.name} geschlossen"
    device.state_text = f"Rollladen {level} % offen"
    return f"Rollladen in {room.name} auf {level} % geöffnet"


def _apply_plug_off(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    if not device.is_on and device.power_w <= 0.0:
        return None
    device.is_on = False
    device.power_w = 0.0
    device.state_text = "Steckdose aus"
    return f"{device.name} in {room.name} ausgeschaltet"


_ACTION_APPLIERS: dict[str, Callable[[RoomState, DeviceState, ActionInput], str | None]] = {
    "heating_off": _apply_heating_off,
    "heating_set": _apply_heating_set,
    "light_on": _apply_light_on,
    "light_off": _apply_light_off,
    "shutter_close": _apply_shutter,
    "shutter_set": _apply_shutter,
    "plug_off": _apply_plug_off,
}


def _apply_action(room: RoomState, device: DeviceState, action: ActionInput) -> str | None:
    """Apply one action; return its German description, or ``None`` when nothing changed."""

    return _ACTION_APPLIERS[action.type](room, device, action)


def _refresh_room(room: RoomState) -> None:
    room.sensors.power_w = round(sum(device.power_w for device in room.devices), 1)
    room.heating_active = any(
        device.type == "heating"
        and device.is_on
        and device.target_temp is not None
        and device.target_temp > room.sensors.temperature
        for device in room.devices
    )
    room.light_on = any(device.type == "light" and device.is_on for device in room.devices)
    room.status_text = _status_text(room.sensors, room.heating_active)


def _refresh_totals(state: HouseState) -> None:
    power_w = round(sum(room.sensors.power_w for room in state.rooms), 1)
    state.totals.power_w = power_w
    state.totals.solar_w = state.outdoor.solar_w
    state.totals.grid_w = round(power_w - state.outdoor.solar_w, 1)


def _persist(
    executions: list[ExecutionOut], automations: list[AutomationOut], sim_time: str
) -> None:
    rules = {automation.id: automation for automation in automations}
    with session_scope() as session:
        for execution in executions:
            session.add(
                AutomationLog(
                    id=execution.id,
                    automation_id=execution.automation_id,
                    sim_time=execution.sim_time,
                    text=execution.text,
                )
            )
            rule = rules.get(execution.automation_id)
            if rule is None or not rule.notify:
                continue
            session.add(
                Message(
                    id=uuid.uuid4().hex,
                    kind="automation",
                    severity="info",
                    room_id=rule.action.room_id,
                    text=f"Automation „{rule.name}“: {execution.text}",
                    created_at=sim_time,
                    acknowledged_at=None,
                )
            )


def evaluate(
    state: HouseState, automations: list[AutomationOut], sim_time: str
) -> list[ExecutionOut]:
    """Evaluate every enabled automation and return the executions it produced.

    Matching rules change the passed state in place, the execution is stored in
    ``automation_log`` and a notifying rule also stores an ``automation``
    message. A rule stays quiet while its action would not change anything, so
    a condition that stays true does not flood the log or the message list.
    """

    executions: list[ExecutionOut] = []
    for automation in automations:
        if not automation.enabled:
            continue
        if not _condition_holds(automation.condition, state, sim_time):
            continue
        resolved = _resolve_device(state, automation.action)
        if resolved is None:
            continue
        room, device = resolved
        text = _apply_action(room, device, automation.action)
        if text is None:
            continue
        _refresh_room(room)
        executions.append(
            ExecutionOut(
                id=uuid.uuid4().hex,
                automation_id=automation.id,
                automation_name=automation.name,
                sim_time=sim_time,
                text=text,
            )
        )

    if executions:
        _refresh_totals(state)
        _persist(executions, automations, sim_time)
    return executions
