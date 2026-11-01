"""Demo seed command.

Run with ``python -m app.seed`` from the backend directory. The command creates
the schema and, only when the database holds no automations yet, fills it with
the demo house, the factory thresholds and automations, a handful of messages
and one day of history per room and metric. A second run changes nothing.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from .db import init_db, session_scope
from .models import Automation, Device, Message, Reading, Room, Threshold
from .schemas import AutomationInput, HouseState, ThresholdOut
from .simulation import house

HISTORY_STEP_MINUTES = 5
HISTORY_DURATION_MINUTES = 24 * 60
METRICS: tuple[str, ...] = ("temperature", "humidity", "co2", "power")


def _insert_house(session: Session, state: HouseState) -> None:
    """Store the rooms and devices of the demo house."""

    for room in state.rooms:
        session.merge(Room(id=room.id, name=room.name))
        for device in room.devices:
            session.merge(
                Device(
                    id=device.id,
                    room_id=device.room_id,
                    name=device.name,
                    type=device.type,
                    is_on=device.is_on,
                    level=device.level,
                    target_temp=device.target_temp,
                    power_w=device.power_w,
                )
            )


def _insert_thresholds(session: Session, thresholds: list[ThresholdOut]) -> None:
    """Store the factory thresholds."""

    for threshold in thresholds:
        session.merge(
            Threshold(
                key=threshold.key,
                value=threshold.value,
                unit=threshold.unit,
                default_value=threshold.default_value,
            )
        )


def _insert_automations(
    session: Session, automations: list[AutomationInput], created_at: str
) -> None:
    """Store the example automations with stable identifiers."""

    for index, automation in enumerate(automations, start=1):
        session.add(
            Automation(
                id=f"seed_automation_{index}",
                name=automation.name,
                enabled=automation.enabled,
                condition_type=automation.condition.type,
                condition_room_id=automation.condition.room_id,
                condition_value=automation.condition.value,
                condition_time=automation.condition.time,
                action_type=automation.action.type,
                action_room_id=automation.action.room_id,
                action_device_id=automation.action.device_id,
                action_value=automation.action.value,
                notify=automation.notify,
                created_at=created_at,
            )
        )


def _insert_messages(session: Session, state: HouseState) -> None:
    """Store a handful of messages with different kinds and severities."""

    now = datetime.fromisoformat(state.sim_time)

    def at(minutes: int) -> str:
        return (now + timedelta(minutes=minutes)).isoformat(timespec="seconds")

    messages = [
        Message(
            id="seed_message_1",
            kind="room_cold",
            severity="warning",
            room_id="bedroom",
            text="Schlafzimmer ist zu kalt: 18,2 °C.",
            created_at=at(-120),
            acknowledged_at=None,
        ),
        Message(
            id="seed_message_2",
            kind="co2_high",
            severity="warning",
            room_id="kitchen",
            text="CO₂ in der Küche ist zu hoch: 1180 ppm.",
            created_at=at(-90),
            acknowledged_at=None,
        ),
        Message(
            id="seed_message_3",
            kind="high_power",
            severity="warning",
            room_id="living_room",
            text="Der Stromverbrauch im Wohnzimmer ist hoch.",
            created_at=at(-50),
            acknowledged_at=None,
        ),
        Message(
            id="seed_message_4",
            kind="automation",
            severity="info",
            room_id="living_room",
            text="Automation „Lüften stoppt Heizung“ wurde ausgeführt.",
            created_at=at(-30),
            acknowledged_at=None,
        ),
        Message(
            id="seed_message_5",
            kind="water",
            severity="critical",
            room_id="bathroom",
            text="Wasserschaden im Badezimmer erkannt.",
            created_at=at(-24 * 60),
            acknowledged_at=at(-23 * 60),
        ),
        Message(
            id="seed_message_6",
            kind="smoke",
            severity="critical",
            room_id="hallway",
            text="Rauchmelder im Flur hat ausgelöst.",
            created_at=at(-2 * 24 * 60),
            acknowledged_at=at(-2 * 24 * 60 + 10),
        ),
    ]
    for message in messages:
        session.merge(message)


def _metric_value(metric: str, base: float, moment: datetime, rng: random.Random) -> float:
    """Return a plausible, deterministic history value around the room's base."""

    minute_of_day = moment.hour * 60 + moment.minute
    cycle = math.sin(2.0 * math.pi * (minute_of_day - 360) / 1440.0)
    if metric == "temperature":
        value = base + 1.2 * cycle + rng.uniform(-0.15, 0.15)
    elif metric == "humidity":
        value = base - 3.0 * cycle + rng.uniform(-0.8, 0.8)
    elif metric == "co2":
        value = base + 90.0 * cycle + rng.uniform(-15.0, 15.0)
    else:
        value = base * (0.7 + 0.25 * cycle) + rng.uniform(-20.0, 20.0)
    return round(max(value, 0.0), 1)


def _insert_readings(session: Session, state: HouseState) -> None:
    """Store one day of history for every room and every metric."""

    seed = house.DEFAULT_SEED
    end = datetime.fromisoformat(state.sim_time)
    start = end - timedelta(minutes=HISTORY_DURATION_MINUTES)
    steps = HISTORY_DURATION_MINUTES // HISTORY_STEP_MINUTES

    rows: list[dict[str, object]] = []
    for room_index, room in enumerate(state.rooms):
        bases = {
            "temperature": room.sensors.temperature,
            "humidity": room.sensors.humidity,
            "co2": room.sensors.co2,
            "power": room.sensors.power_w,
        }
        for metric_index, metric in enumerate(METRICS):
            rng = random.Random(seed * 100_000 + room_index * 100 + metric_index)
            for step in range(steps + 1):
                moment = start + timedelta(minutes=step * HISTORY_STEP_MINUTES)
                rows.append(
                    {
                        "room_id": room.id,
                        "metric": metric,
                        "value": _metric_value(metric, bases[metric], moment, rng),
                        "sim_time": moment.isoformat(timespec="seconds"),
                    }
                )
    if rows:
        session.execute(insert(Reading), rows)


def seed() -> None:
    """Populate the demo house unless the database already holds automations."""

    init_db()
    with session_scope() as session:
        has_automations = session.scalars(select(Automation.id).limit(1)).first() is not None
        if has_automations:
            return

        state = house.build_house(house.DEFAULT_SEED)
        _insert_house(session, state)
        _insert_thresholds(session, house.default_thresholds())
        _insert_automations(session, house.default_automations(), state.sim_time)
        _insert_messages(session, state)
        _insert_readings(session, state)


def main() -> int:
    seed()
    print("Seed abgeschlossen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
