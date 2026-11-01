"""Simulation state persistence.

:func:`save` stores the complete house state and the simulation settings in the
SQLite store, :func:`load` restores them so a restarted backend continues where
it stopped, and :func:`reset_store` clears messages, executions and readings and
writes the initial house back.

:func:`save` commits so the snapshot is durable on disk even when the caller
only holds a plain session; a failed write is rolled back and re-raised.
"""

from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..models import (
    Automation,
    AutomationLog,
    Device,
    Message,
    Reading,
    Room,
    SimState,
    Threshold,
)
from ..schemas import (
    AutomationInput,
    HouseState,
    OutdoorState,
    SettingsOut,
    ThresholdOut,
)
from . import house

SIM_STATE_ID = 1
DEFAULT_AUTOMATION_ID = "seed_automation_{index}"


def _write_house(session: Session, state: HouseState) -> None:
    """Upsert the room and device rows of the house state."""

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


def _write_thresholds(session: Session, thresholds: list[ThresholdOut]) -> None:
    for threshold in thresholds:
        session.merge(
            Threshold(
                key=threshold.key,
                value=threshold.value,
                unit=threshold.unit,
                default_value=threshold.default_value,
            )
        )


def _write_automations(
    session: Session, automations: list[AutomationInput], created_at: str
) -> None:
    for index, automation in enumerate(automations, start=1):
        session.add(
            Automation(
                id=DEFAULT_AUTOMATION_ID.format(index=index),
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


def _settings_from_row(row: SimState) -> SettingsOut:
    return SettingsOut(
        weather=row.weather,
        season=row.season,
        occupancy_mode=row.occupancy_mode,
        speed=int(row.speed),
        seed=int(row.seed),
        paused=bool(row.paused),
        sim_time=row.sim_time,
        weekday=row.weekday,
    )


def _state_from_row(row: SimState) -> HouseState:
    """Rebuild a house state from the scalar columns (fallback without snapshot)."""

    state = house.build_house(int(row.seed))
    state.sim_time = row.sim_time
    state.weekday = row.weekday
    state.tick = int(row.tick)
    state.paused = bool(row.paused)
    state.speed = row.speed
    state.outdoor = OutdoorState(
        temperature=row.outdoor_temperature,
        weather=row.outdoor_weather,
        season=row.outdoor_season,
        is_day=bool(row.is_day),
        sunrise=row.sunrise,
        sunset=row.sunset,
        solar_w=row.solar_w,
    )
    return state


def load(session: Session) -> tuple[HouseState, SettingsOut] | None:
    """Load the persisted house state and settings, or ``None`` when empty."""

    row = session.get(SimState, SIM_STATE_ID)
    if row is None:
        return None

    settings = _settings_from_row(row)
    if row.state_json:
        try:
            state = HouseState.model_validate_json(row.state_json)
        except ValueError:
            state = None
        if state is not None:
            return state, settings
    return _state_from_row(row), settings


def save(session: Session, state: HouseState, settings: SettingsOut) -> None:
    """Persist the current house state and settings."""

    row = session.get(SimState, SIM_STATE_ID)
    if row is None:
        row = SimState(id=SIM_STATE_ID)
        session.add(row)

    row.sim_time = settings.sim_time
    row.weekday = settings.weekday
    row.tick = state.tick
    row.paused = settings.paused
    row.speed = settings.speed
    row.seed = settings.seed
    row.weather = settings.weather
    row.season = settings.season
    row.occupancy_mode = settings.occupancy_mode
    row.outdoor_temperature = state.outdoor.temperature
    row.outdoor_weather = state.outdoor.weather
    row.outdoor_season = state.outdoor.season
    row.is_day = state.outdoor.is_day
    row.sunrise = state.outdoor.sunrise
    row.sunset = state.outdoor.sunset
    row.solar_w = state.outdoor.solar_w
    row.state_json = state.model_dump_json()

    _write_house(session, state)
    session.commit()


def reset_store(session: Session, reset_automations: bool, reset_thresholds: bool) -> None:
    """Reset persisted simulation data and optionally automations and thresholds."""

    session.execute(delete(Message))
    session.execute(delete(AutomationLog))
    session.execute(delete(Reading))

    settings = house.initial_settings()

    if reset_automations:
        session.execute(delete(Automation))
        _write_automations(session, house.default_automations(), settings.sim_time)

    if reset_thresholds:
        session.execute(delete(Threshold))
        _write_thresholds(session, house.default_thresholds())

    state = house.build_house(settings.seed)
    save(session, state, settings)
