"""Occupant behaviour simulation.

The engine calls :func:`step_behavior` every tick. It derives presence, motion,
light use and appliance use from the simulated clock and the configured
occupancy mode. The engine owns that setting; because the shared step signature
carries no settings argument, the mode is handed over once via
:func:`set_occupancy_mode` (or, if the engine prefers, by attaching an
``occupancy_mode`` attribute to the state object). The module default is
``everyday`` so a standalone call is always safe.

The schedule only acts when it changes its mind: a light or appliance is
switched when the desired state of the schedule differs from the one of the
previous step (or on the first step of a house); a room's light is also set
again when its occupancy or daylight changes, so a light left on is switched
off at sunrise. In between, a device someone switched by hand keeps the state
it was given, so a manual command is not undone on the next tick. An occupant who enters a room closes a window that
was left open there.

Only the engine's seeded ``rng`` is accepted as a randomness source.
"""

from __future__ import annotations

import weakref
from dataclasses import dataclass
from datetime import datetime
from random import Random

from ..schemas import HouseState, OccupancyMode, RoomState

DEFAULT_OCCUPANCY_MODE: OccupancyMode = "everyday"

_mode: OccupancyMode = DEFAULT_OCCUPANCY_MODE

_WEEKEND = frozenset({"Samstag", "Sonntag"})

_APPLIANCE_RATINGS_W = {
    "kitchen_coffee": 900.0,
    "living_room_tv": 120.0,
    "childrens_room_desk": 60.0,
    "bedroom_bedside": 30.0,
    "bathroom_washer": 1200.0,
}


@dataclass(frozen=True)
class _Schedule:
    """The desired occupant state of one step: who is where, what should run."""

    active: frozenset[str]
    lights: dict[str, tuple[bool, bool]]
    appliances: dict[str, bool]


_LAST_SCHEDULE: dict[int, tuple[weakref.ReferenceType[HouseState], _Schedule]] = {}


def _swap_schedule(state: HouseState, schedule: _Schedule) -> _Schedule | None:
    """Store ``schedule`` for ``state`` and return the one of its previous step."""

    key = id(state)
    entry = _LAST_SCHEDULE.get(key)
    previous = entry[1] if entry is not None and entry[0]() is state else None

    def _forget(reference: weakref.ReferenceType[HouseState]) -> None:
        _LAST_SCHEDULE.pop(key, None)

    _LAST_SCHEDULE[key] = (weakref.ref(state, _forget), schedule)
    return previous


def set_occupancy_mode(mode: OccupancyMode) -> None:
    """Configure the occupancy mode used by the next behaviour steps."""

    global _mode
    _mode = mode


def get_occupancy_mode() -> OccupancyMode:
    """Return the currently configured occupancy mode."""

    return _mode


def _resolve_mode(state: HouseState) -> OccupancyMode:
    """Use a mode attached to the state if present, else the module setting."""

    attached = getattr(state, "occupancy_mode", None)
    if attached in ("everyday", "home", "away"):
        return attached
    return _mode


def _hour_of_day(sim_time: str) -> float:
    """Return the simulated hour as a float; fall back to noon on bad input."""

    try:
        moment = datetime.fromisoformat(sim_time)
    except ValueError:
        return 12.0
    return moment.hour + moment.minute / 60.0


def _home_active_rooms(hour: float) -> set[str]:
    """Rooms with an awake occupant in the always-at-home mode."""

    if 6.0 <= hour < 22.0:
        rooms = {"living_room", "kitchen", "hallway"}
        if 6.5 <= hour < 8.0:
            rooms.add("bathroom")
        if 17.0 <= hour < 21.0:
            rooms.add("childrens_room")
        return rooms
    if 22.0 <= hour < 23.5:
        return {"bedroom", "bathroom"}
    return set()


def _weekend_active_rooms(hour: float) -> set[str]:
    """Rooms with an awake occupant on a weekend day."""

    if 7.0 <= hour < 22.0:
        rooms = {"living_room", "kitchen", "hallway"}
        if 8.0 <= hour < 20.0:
            rooms.add("childrens_room")
        if 8.0 <= hour < 9.0:
            rooms.add("bathroom")
        return rooms
    if 22.0 <= hour < 23.5:
        return {"bedroom", "bathroom"}
    return set()


def _everyday_active_rooms(hour: float) -> set[str]:
    """Rooms with an awake occupant on a weekday in the everyday mode."""

    if 6.0 <= hour < 8.0:
        return {"bathroom", "kitchen", "hallway"}
    if 16.0 <= hour < 22.0:
        rooms = {"living_room", "kitchen", "hallway"}
        if 16.0 <= hour < 20.0:
            rooms.add("childrens_room")
        return rooms
    if 22.0 <= hour < 23.0:
        return {"bedroom", "bathroom", "hallway"}
    return set()


def _active_rooms(mode: OccupancyMode, hour: float, weekend: bool) -> set[str]:
    """Return the rooms with an awake occupant at the simulated hour."""

    if mode == "away":
        return set()
    if mode == "home":
        return _home_active_rooms(hour)
    if weekend:
        return _weekend_active_rooms(hour)
    return _everyday_active_rooms(hour)


def _appliance_targets(mode: OccupancyMode, hour: float, weekend: bool) -> dict[str, bool]:
    """Return the desired on/off state of the household appliances."""

    targets = dict.fromkeys(_APPLIANCE_RATINGS_W, False)
    if mode == "away":
        return targets

    if mode == "home":
        targets["kitchen_coffee"] = 6.5 <= hour < 8.0
        targets["bathroom_washer"] = 12.0 <= hour < 14.0
        targets["childrens_room_desk"] = 16.0 <= hour < 19.0
        targets["living_room_tv"] = 18.0 <= hour < 22.5
        targets["bedroom_bedside"] = 22.0 <= hour < 23.5
        return targets

    if weekend:
        targets["kitchen_coffee"] = 7.5 <= hour < 9.0
        targets["bathroom_washer"] = 10.0 <= hour < 12.0
        targets["childrens_room_desk"] = 10.0 <= hour < 12.0 or 15.0 <= hour < 18.0
        targets["living_room_tv"] = 18.0 <= hour < 22.5
        return targets

    targets["kitchen_coffee"] = 6.5 <= hour < 7.5
    targets["bathroom_washer"] = 17.0 <= hour < 18.0
    targets["childrens_room_desk"] = 16.0 <= hour < 19.0
    targets["living_room_tv"] = 18.0 <= hour < 22.5
    targets["bedroom_bedside"] = 22.0 <= hour < 23.0
    return targets


def _set_light(room: RoomState, is_on: bool) -> None:
    for device in room.devices:
        if device.type != "light":
            continue
        device.is_on = is_on
        device.level = 100 if is_on else 0
        device.power_w = 40.0 if is_on else 0.0
        device.state_text = "Licht an" if is_on else "Licht aus"


def _set_appliance(room: RoomState, device_slug: str, is_on: bool) -> None:
    device_id = f"{room.id}_{device_slug}"
    for device in room.devices:
        if device.id != device_id:
            continue
        device.is_on = is_on
        device.power_w = _APPLIANCE_RATINGS_W[device_id] if is_on else 0.0
        if device.type == "appliance":
            device.state_text = f"{device.name} an" if is_on else f"{device.name} aus"
        else:
            device.state_text = "Steckdose an" if is_on else "Steckdose aus"
        return


def step_behavior(state: HouseState, rng: Random, dt_min: int) -> None:
    """Advance motion, light use and appliance use by ``dt_min`` simulated minutes."""

    del rng  # Household use is schedule-driven and deterministic for a given seed.

    mode = _resolve_mode(state)
    hour = _hour_of_day(state.sim_time)
    weekend = state.weekday in _WEEKEND
    active = _active_rooms(mode, hour, weekend)
    need_light = not state.outdoor.is_day
    schedule = _Schedule(
        active=frozenset(active),
        lights={room.id: (room.id in active, need_light) for room in state.rooms},
        appliances=_appliance_targets(mode, hour, weekend),
    )
    previous = _swap_schedule(state, schedule)

    for room in state.rooms:
        _step_room(room, schedule, previous)


def _step_room(room: RoomState, schedule: _Schedule, previous: _Schedule | None) -> None:
    """Apply the schedule to one room, touching only what changed since ``previous``.

    A setting the schedule did not change stays as the resident left it.
    """

    room.sensors.motion = room.id in schedule.active
    entered = previous is not None and room.id in schedule.active and room.id not in previous.active
    if entered:
        room.sensors.window_open = False
    occupied, dark = schedule.lights[room.id]
    if previous is None or previous.lights.get(room.id) != (occupied, dark):
        _set_light(room, occupied and dark)
    _step_appliances(room, schedule, previous)
    room.sensors.power_w = round(sum(device.power_w for device in room.devices), 1)
    room.light_on = any(device.type == "light" and device.is_on for device in room.devices)


def _step_appliances(room: RoomState, schedule: _Schedule, previous: _Schedule | None) -> None:
    prefix = f"{room.id}_"
    for device_id, is_on in schedule.appliances.items():
        if not device_id.startswith(prefix):
            continue
        if previous is None or previous.appliances.get(device_id) != is_on:
            _set_appliance(room, device_id[len(prefix) :], is_on)
