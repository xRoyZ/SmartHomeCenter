"""Manual event triggers.

An event forces one of the contract's event types on the running house state:
it changes the affected room's sensors and devices measurably and returns the
German message that is shown to the user. Events that name a room only touch
that room; ``occupant_rush`` simulates the whole house when no room is given.
"""

from __future__ import annotations

from random import Random
from uuid import uuid4

from ..schemas import HouseState, MessageKind, MessageOut, MessageSeverity, RoomState
from .house import _status_text

EVENT_TYPES: tuple[str, ...] = (
    "forgotten_window",
    "water_damage",
    "power_spike",
    "smoke_alarm",
    "occupant_rush",
)

DEFAULT_ROOMS: dict[str, str] = {
    "forgotten_window": "living_room",
    "water_damage": "bathroom",
    "power_spike": "kitchen",
    "smoke_alarm": "kitchen",
}

EVENT_MESSAGES: dict[str, tuple[MessageKind, MessageSeverity]] = {
    "forgotten_window": ("room_cold", "warning"),
    "water_damage": ("water", "critical"),
    "power_spike": ("power_spike", "critical"),
    "smoke_alarm": ("smoke", "critical"),
    "occupant_rush": ("automation", "info"),
}


def _find_room(state: HouseState, room_id: str) -> RoomState | None:
    return next((room for room in state.rooms if room.id == room_id), None)


def _target_rooms(state: HouseState, event_type: str, room_id: str | None) -> list[RoomState]:
    if room_id is not None:
        room = _find_room(state, room_id)
        if room is None:
            raise ValueError(f"unknown room: {room_id}")
        return [room]
    if event_type == "occupant_rush":
        return list(state.rooms)
    room = _find_room(state, DEFAULT_ROOMS.get(event_type, ""))
    if room is None and state.rooms:
        room = state.rooms[0]
    return [room] if room is not None else []


def _refresh_room(room: RoomState) -> None:
    """Recompute the derived room flags after an event changed its values."""

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
    total_power = round(sum(room.sensors.power_w for room in state.rooms), 1)
    state.totals.power_w = total_power
    state.totals.grid_w = round(total_power - state.totals.solar_w, 1)


def _switch_heating_off(room: RoomState, reason: str) -> None:
    for device in room.devices:
        if device.type == "heating" and device.is_on:
            device.is_on = False
            device.power_w = 0.0
            device.state_text = f"Heizung aus ({reason})"


def _apply_forgotten_window(room: RoomState, rng: Random) -> str:
    drop = round(rng.uniform(1.2, 1.8), 1)
    room.sensors.window_open = True
    room.sensors.temperature = round(room.sensors.temperature - drop, 1)
    room.sensors.humidity = round(room.sensors.humidity + rng.uniform(1.0, 3.0), 1)
    _refresh_room(room)
    return f"{room.name}: Fenster offen — der Raum kühlt aus."


def _apply_water_damage(room: RoomState, rng: Random) -> str:
    room.sensors.water = True
    room.sensors.humidity = round(room.sensors.humidity + rng.uniform(9.0, 15.0), 1)
    room.sensors.temperature = round(room.sensors.temperature - rng.uniform(0.8, 1.4), 1)
    for device in room.devices:
        if device.type in ("plug", "appliance"):
            device.is_on = False
            device.power_w = 0.0
            device.state_text = f"{device.name} aus (Wasserschaden)"
    _switch_heating_off(room, "Wasserschaden")
    _refresh_room(room)
    return f"{room.name}: Wasserschaden erkannt — die Feuchtigkeit steigt."


def _apply_power_spike(room: RoomState, rng: Random) -> str:
    spike = round(rng.uniform(1600.0, 2200.0), 1)
    consumers = [device for device in room.devices if device.type in ("plug", "appliance")]
    if consumers:
        device = max(consumers, key=lambda item: item.power_w)
    else:
        device = next((item for item in room.devices if item.type == "heating"), None)
    if device is not None:
        device.is_on = True
        device.power_w = round(device.power_w + spike, 1)
        device.state_text = f"{device.name} an (Stromspitze)"
    _refresh_room(room)
    return f"{room.name}: Stromspitze — {room.sensors.power_w:.0f} W im Raum."


def _apply_smoke_alarm(room: RoomState, rng: Random) -> str:
    room.sensors.smoke = True
    room.sensors.co2 = round(room.sensors.co2 + rng.uniform(250.0, 400.0), 1)
    room.sensors.temperature = round(room.sensors.temperature + rng.uniform(1.0, 2.0), 1)
    _switch_heating_off(room, "Rauchalarm")
    _refresh_room(room)
    return f"{room.name}: Rauchmelder ausgelöst."


def _apply_occupant_rush(room: RoomState, rng: Random) -> str:
    room.sensors.motion = True
    room.sensors.co2 = round(room.sensors.co2 + rng.uniform(120.0, 200.0), 1)
    room.sensors.temperature = round(room.sensors.temperature + rng.uniform(0.2, 0.5), 1)
    room.sensors.humidity = round(room.sensors.humidity + rng.uniform(2.0, 5.0), 1)
    for device in room.devices:
        if device.type == "light" and not device.is_on:
            device.is_on = True
            device.level = 100
            device.power_w = 40.0
            device.state_text = "Licht an"
            break
    _refresh_room(room)
    return f"{room.name}: Bewohner-Andrang — Bewegung und CO₂ steigen."


_HANDLERS = {
    "forgotten_window": _apply_forgotten_window,
    "water_damage": _apply_water_damage,
    "power_spike": _apply_power_spike,
    "smoke_alarm": _apply_smoke_alarm,
    "occupant_rush": _apply_occupant_rush,
}


def apply(state: HouseState, event_type: str, room_id: str | None, rng: Random) -> MessageOut:
    """Apply a manual event to the state and return the message it produced."""

    if event_type not in EVENT_TYPES:
        raise ValueError(f"unknown event type: {event_type}")

    rooms = _target_rooms(state, event_type, room_id)
    texts = [_HANDLERS[event_type](room, rng) for room in rooms]

    kind, severity = EVENT_MESSAGES[event_type]
    if event_type == "occupant_rush" and room_id is None:
        message_room: RoomState | None = None
        text = "Bewohner-Andrang im ganzen Haus — Bewegung und CO₂ steigen."
    else:
        message_room = rooms[0] if rooms else None
        text = texts[0] if texts else "Ereignis ausgelöst."

    state.open_messages += 1
    if message_room is not None:
        message_room.open_messages += 1
    _refresh_totals(state)

    return MessageOut(
        id=uuid4().hex,
        kind=kind,
        severity=severity,
        room_id=message_room.id if message_room is not None else None,
        room_name=message_room.name if message_room is not None else None,
        text=text,
        created_at=state.sim_time,
        acknowledged_at=None,
    )
