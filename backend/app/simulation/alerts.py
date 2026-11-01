"""Threshold alert evaluation.

The evaluator compares the current house state with the stored thresholds and
returns the messages a tick produced. It is edge-triggered: a message is only
created when a room crosses its limit, so a condition that is already reported
by a still-open message is not reported again on the next tick. ``power_spike``
needs the previous tick's consumption, so the evaluator keeps a small
per-state memory instead of mutating the shared house state or the database.
"""

from __future__ import annotations

import weakref
from uuid import uuid4

from ..schemas import HouseState, MessageKind, MessageOut, MessageSeverity, ThresholdOut
from . import house

_ALERT_SEVERITY: dict[MessageKind, MessageSeverity] = {
    "room_cold": "warning",
    "room_hot": "warning",
    "co2_high": "warning",
    "high_power": "warning",
    "power_spike": "critical",
    "smoke": "critical",
    "water": "critical",
    "automation": "info",
}


class _StateMemory:
    """Remember which alerts a house already reported and its last consumption."""

    __slots__ = ("active", "last_power", "thresholds")

    def __init__(self, last_power: float) -> None:
        self.active: set[tuple[str, str | None]] = set()
        self.last_power = last_power
        self.thresholds: list[ThresholdOut] | None = None


_MEMORIES: dict[int, tuple[weakref.ReferenceType[HouseState], _StateMemory]] = {}


def _memory_for(state: HouseState) -> _StateMemory:
    """Return the alert memory of ``state``, creating it on first evaluation."""

    key = id(state)
    entry = _MEMORIES.get(key)
    if entry is not None and entry[0]() is state:
        return entry[1]

    memory = _StateMemory(state.totals.power_w)

    def _forget(reference: weakref.ReferenceType[HouseState]) -> None:
        _MEMORIES.pop(key, None)

    _MEMORIES[key] = (weakref.ref(state, _forget), memory)
    return memory


def remember_state(state: HouseState) -> None:
    """Treat every condition the state currently shows as already alerted.

    A manual event changes the house state outside the tick and stores its
    message immediately. Without this the next threshold evaluation would
    report the same condition a second time under a different text (and the
    limits the event pushed past would appear as extra messages), so the
    event's one visible message would be shadowed by duplicates. The
    conditions stay marked until they clear, which keeps the evaluator's
    edge-triggered behaviour.

    The evaluator caches the thresholds of the last tick for this, so an event
    between two ticks is judged against exactly the limits the next tick will
    use; before the first tick the factory defaults apply, as they do to the
    engine.
    """

    memory = _memory_for(state)
    thresholds = memory.thresholds or house.default_thresholds()
    memory.active = set(_triggered(state, thresholds, state.sim_time, memory))


def _threshold_values(thresholds: list[ThresholdOut]) -> dict[str, float]:
    """Merge the stored thresholds with the factory defaults for missing keys."""

    values = {threshold.key: threshold.value for threshold in house.default_thresholds()}
    values.update({threshold.key: threshold.value for threshold in thresholds})
    return values


def _number(value: float, digits: int = 1) -> str:
    """Format a number the German way: a comma as the decimal separator."""

    return f"{value:.{digits}f}".replace(".", ",")


def _message(
    kind: MessageKind,
    room_id: str | None,
    room_name: str | None,
    text: str,
    sim_time: str,
) -> MessageOut:
    return MessageOut(
        id=uuid4().hex,
        kind=kind,
        severity=_ALERT_SEVERITY[kind],
        room_id=room_id,
        room_name=room_name,
        text=text,
        created_at=sim_time,
        acknowledged_at=None,
    )


def _triggered(
    state: HouseState,
    thresholds: list[ThresholdOut],
    sim_time: str,
    memory: _StateMemory,
) -> dict[tuple[str, str | None], MessageOut]:
    """Return every alert condition the current state shows, keyed by condition."""

    values = _threshold_values(thresholds)

    min_temperature = values["min_temperature"]
    max_temperature = values["max_temperature"]
    max_co2 = values["max_co2"]
    max_power = values["max_power"]
    power_spike_delta = values["power_spike_delta"]

    triggered: dict[tuple[str, str | None], MessageOut] = {}

    for room in state.rooms:
        sensors = room.sensors
        if sensors.smoke:
            triggered[("smoke", room.id)] = _message(
                "smoke",
                room.id,
                room.name,
                f"Rauchmelder in {room.name} hat ausgelöst.",
                sim_time,
            )
        if sensors.water:
            triggered[("water", room.id)] = _message(
                "water",
                room.id,
                room.name,
                f"Wasserschaden in {room.name} erkannt.",
                sim_time,
            )
        if sensors.temperature < min_temperature:
            triggered[("room_cold", room.id)] = _message(
                "room_cold",
                room.id,
                room.name,
                f"{room.name} ist zu kalt: {_number(sensors.temperature)} °C "
                f"(Grenze {_number(min_temperature)} °C).",
                sim_time,
            )
        if sensors.temperature > max_temperature:
            triggered[("room_hot", room.id)] = _message(
                "room_hot",
                room.id,
                room.name,
                f"{room.name} ist zu warm: {_number(sensors.temperature)} °C "
                f"(Grenze {_number(max_temperature)} °C).",
                sim_time,
            )
        if sensors.co2 > max_co2:
            triggered[("co2_high", room.id)] = _message(
                "co2_high",
                room.id,
                room.name,
                f"CO₂ in {room.name} ist zu hoch: {_number(sensors.co2, 0)} ppm "
                f"(Grenze {_number(max_co2, 0)} ppm).",
                sim_time,
            )

    total_power = state.totals.power_w
    if total_power > max_power:
        triggered[("high_power", None)] = _message(
            "high_power",
            None,
            None,
            f"Der Stromverbrauch im Haus ist hoch: {_number(total_power, 0)} W "
            f"(Grenze {_number(max_power, 0)} W).",
            sim_time,
        )

    power_delta = total_power - memory.last_power
    memory.last_power = total_power
    if power_delta > power_spike_delta:
        triggered[("power_spike", None)] = _message(
            "power_spike",
            None,
            None,
            f"Stromspitze: Der Verbrauch stieg um {_number(power_delta, 0)} W.",
            sim_time,
        )

    return triggered


def evaluate(state: HouseState, thresholds: list[ThresholdOut], sim_time: str) -> list[MessageOut]:
    """Evaluate thresholds and return the messages they produced.

    Only limits that a room just crossed produce a message: a condition that is
    already covered by an open alert of the same kind and room stays silent
    until it clears and is crossed again. The engine stores the returned
    messages and broadcasts the updated state.
    """

    memory = _memory_for(state)
    memory.thresholds = thresholds
    triggered = _triggered(state, thresholds, sim_time, memory)
    produced = [message for key, message in triggered.items() if key not in memory.active]
    memory.active = set(triggered)
    return produced
