"""Device detail and device control endpoints.

A device command is validated against the device type and its value ranges before
anything is changed. An accepted command updates the running engine state, so the
next tick and every following ``/api/state`` snapshot carry it, and is broadcast to
all connected clients immediately. A rejected command leaves both the simulation
state and the SQLite rows untouched.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import (
    ApiError,
    DeviceCommand,
    DeviceDetail,
    DeviceState,
    HistorySeries,
    HouseState,
    LastAction,
    RoomState,
)
from ..simulation import history
from ..simulation.engine import SimulationEngine
from ..simulation.house import _status_text
from ..ws import manager

router = APIRouter(prefix="/api/devices", tags=["devices"])

SERIES_METRICS: tuple[str, ...] = ("temperature", "humidity", "co2", "power")
SERIES_WINDOW = "15m"
SERIES_UNITS: dict[str, str] = {
    "temperature": "°C",
    "humidity": "%",
    "co2": "ppm",
    "power": "W",
}

# Which command fields each device type accepts. Pydantic already rejects values
# outside the contract's ranges; this table rejects a field the type has no use
# for (for example a brightness on a plug).
_ALLOWED_FIELDS: dict[str, frozenset[str]] = {
    "heating": frozenset({"target_temp"}),
    "light": frozenset({"is_on", "level"}),
    "shutter": frozenset({"level"}),
    "plug": frozenset({"is_on"}),
    "appliance": frozenset({"is_on"}),
}

# Rated power of the demo house's switched devices. The device state only stores
# the current draw, so a device that is off needs this to come back on with its
# realistic consumption.
_NOMINAL_POWER: dict[str, float] = {
    "living_room_tv": 120.0,
    "kitchen_fridge": 90.0,
    "kitchen_coffee": 900.0,
    "bedroom_bedside": 30.0,
    "childrens_room_desk": 60.0,
    "bathroom_washer": 1200.0,
}
_DEFAULT_POWER: dict[str, float] = {"plug": 100.0, "appliance": 500.0}
_LIGHT_MAX_POWER = 40.0
_HEATING_POWER = 700.0


def _engine(request: Request) -> SimulationEngine:
    """Return the running simulation engine, never the unstarted fallback."""

    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise ApiError(500, "internal_error", "Die Simulation ist nicht gestartet.")
    return engine


def _find_device(state: HouseState, device_id: str) -> tuple[RoomState, DeviceState]:
    """Return the room and device for ``device_id`` or answer ``unknown_device``."""

    for room in state.rooms:
        for device in room.devices:
            if device.id == device_id:
                return room, device
    raise ApiError(404, "unknown_device", "Das Gerät wurde nicht gefunden.")


def _last_actions(request: Request) -> dict[str, LastAction]:
    """Return the per-application store of the most recent device actions."""

    store = getattr(request.app.state, "device_actions", None)
    if store is None:
        store = {}
        request.app.state.device_actions = store
    return store


def _format_decimal(value: float) -> str:
    return f"{value:.1f}".replace(".", ",")


def _provided_fields(command: DeviceCommand) -> set[str]:
    return {name for name, value in command.model_dump().items() if value is not None}


def _validate_command(device: DeviceState, command: DeviceCommand) -> None:
    """Reject a command that sets no field or a field the device cannot use."""

    allowed = _ALLOWED_FIELDS.get(device.type, frozenset())
    provided = _provided_fields(command)
    if not provided:
        raise ApiError(
            422,
            "validation_error",
            "Es wurde keine gültige Einstellung übergeben.",
        )
    rejected = sorted(provided - allowed)
    if rejected:
        names = ", ".join(f"'{field}'" for field in rejected)
        raise ApiError(
            422,
            "validation_error",
            f"Für dieses Gerät kann {names} nicht gesetzt werden.",
        )


def _nominal_power(device: DeviceState) -> float:
    if device.id in _NOMINAL_POWER:
        return _NOMINAL_POWER[device.id]
    if device.power_w > 0.0:
        return device.power_w
    return _DEFAULT_POWER.get(device.type, 0.0)


def _apply_heating(room: RoomState, device: DeviceState, command: DeviceCommand) -> str:
    target = command.target_temp
    if target is None:
        raise ApiError(422, "validation_error", "Es wurde keine Solltemperatur übergeben.")
    device.target_temp = round(float(target), 1)
    # A setpoint switches the thermostat on; whether it heats right now follows
    # from the room temperature, so a room that cools below a setpoint set on
    # a warm day is heated again later.
    device.is_on = True
    heats = device.target_temp > room.sensors.temperature
    device.power_w = _HEATING_POWER if heats else 0.0
    device.level = 100 if heats else 0
    device.state_text = "Heizung heizt" if heats else "Heizung aus"
    return f"Soll auf {_format_decimal(device.target_temp)} °C gesetzt"


def _apply_light(device: DeviceState, command: DeviceCommand) -> str:
    if command.level is not None:
        device.level = int(command.level)
        device.is_on = device.level > 0
    else:
        device.is_on = bool(command.is_on)
        device.level = 100 if device.is_on else 0
    device.power_w = round(_LIGHT_MAX_POWER * (device.level or 0) / 100.0, 1)
    device.state_text = "Licht an" if device.is_on else "Licht aus"
    if device.is_on:
        return f"Licht auf {device.level} % eingeschaltet"
    return "Licht ausgeschaltet"


def _apply_shutter(device: DeviceState, command: DeviceCommand) -> str:
    level = command.level
    if level is None:
        raise ApiError(422, "validation_error", "Es wurde keine Rollladenposition übergeben.")
    device.level = int(level)
    device.is_on = False
    device.power_w = 0.0
    device.state_text = f"Rollladen {device.level} % offen"
    return f"Rollladen auf {device.level} % gefahren"


def _apply_switched(device: DeviceState, command: DeviceCommand) -> str:
    device.is_on = bool(command.is_on)
    device.power_w = _nominal_power(device) if device.is_on else 0.0
    if device.type == "plug":
        device.state_text = "Steckdose an" if device.is_on else "Steckdose aus"
        if device.is_on:
            return f"{device.name} eingeschaltet"
        return f"{device.name} ausgeschaltet"
    device.state_text = f"{device.name} an" if device.is_on else f"{device.name} aus"
    if device.is_on:
        return f"{device.name} gestartet"
    return f"{device.name} ausgeschaltet"


def _apply_command(room: RoomState, device: DeviceState, command: DeviceCommand) -> str:
    """Write a validated command into the device and return its German action text."""

    if device.type == "heating":
        return _apply_heating(room, device, command)
    if device.type == "light":
        return _apply_light(device, command)
    if device.type == "shutter":
        return _apply_shutter(device, command)
    return _apply_switched(device, command)


def _refresh_room(room: RoomState) -> None:
    """Recompute the room's derived flags, power and German status text."""

    heating = next((device for device in room.devices if device.type == "heating"), None)
    room.heating_active = bool(
        heating is not None
        and heating.is_on
        and heating.target_temp is not None
        and heating.target_temp > room.sensors.temperature
    )
    room.light_on = any(device.type == "light" and device.is_on for device in room.devices)
    room.sensors.power_w = round(sum(device.power_w for device in room.devices), 1)
    room.status_text = _status_text(room.sensors, room.heating_active)


def _refresh_totals(state: HouseState) -> None:
    power_w = round(sum(room.sensors.power_w for room in state.rooms), 1)
    state.totals.power_w = power_w
    state.totals.grid_w = round(power_w - state.totals.solar_w, 1)


def _empty_series(room_id: str, metric: str) -> HistorySeries:
    return HistorySeries(
        room_id=room_id,
        metric=metric,
        window=SERIES_WINDOW,
        unit=SERIES_UNITS[metric],
        points=[],
    )


def _series_for(session: Session, room_id: str) -> list[HistorySeries]:
    """Return the room's last-15-minutes series for the device chart.

    Until the history recording slice is wired, the query is a declared stub; the
    honest reading of a series that is not recorded yet is an empty series, so the
    device page still renders instead of failing.
    """

    series: list[HistorySeries] = []
    for metric in SERIES_METRICS:
        try:
            series.append(history.query(session, room_id, metric, SERIES_WINDOW))
        except NotImplementedError:
            series.append(_empty_series(room_id, metric))
    return series


@router.get("/{device_id}")
async def get_device(
    device_id: str,
    request: Request,
    session: Session = Depends(get_session),
) -> DeviceDetail:
    """Return one device with its room, recent series and last action."""

    engine = _engine(request)
    room, device = _find_device(engine.state, device_id)
    return DeviceDetail(
        device=device,
        room_name=room.name,
        series=_series_for(session, room.id),
        last_action=_last_actions(request).get(device.id),
    )


@router.put("/{device_id}/state")
async def set_device_state(
    device_id: str,
    command: DeviceCommand,
    request: Request,
    session: Session = Depends(get_session),
) -> DeviceDetail:
    """Validate and apply a device command to the running simulation."""

    engine = _engine(request)
    room, device = _find_device(engine.state, device_id)
    _validate_command(device, command)

    # Read the history before mutating so a failing read can never leave a
    # half-applied command behind.
    series = _series_for(session, room.id)

    action_text = _apply_command(room, device, command)
    _refresh_room(room)
    _refresh_totals(engine.state)
    _last_actions(request)[device.id] = LastAction(
        sim_time=engine.state.sim_time,
        text=action_text,
    )

    await manager.broadcast(engine.state)

    return DeviceDetail(
        device=device,
        room_name=room.name,
        series=series,
        last_action=_last_actions(request).get(device.id),
    )
