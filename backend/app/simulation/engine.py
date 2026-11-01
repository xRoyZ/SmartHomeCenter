"""The simulation engine.

The engine owns the mutable :class:`HouseState`, advances it one simulated minute
per tick and publishes every snapshot to the WebSocket broadcaster. One tick
runs the weather, occupant, physics, automation and alert steps in that order,
records the resulting readings and persists state and settings.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import random
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Automation, Message, Threshold
from ..schemas import (
    ActionInput,
    AutomationOut,
    ConditionInput,
    HouseState,
    MessageOut,
    SettingsOut,
    SettingsUpdate,
    ThresholdOut,
)
from . import (
    alerts,
    behavior,
    events,
    history,
    house,
    persistence,
    physics,
    weather,
)
from . import (
    automation as automation_step,
)

PublishCallback = Callable[[HouseState], Awaitable[None]]

WEEKDAYS = (
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag",
    "Sonntag",
)

_logger = logging.getLogger("smarthome.simulation")


class SimulationEngine:
    """Owns the mutable simulation state and publishes snapshots to clients."""

    def __init__(self, db_factory: Callable[[], Any], publish: PublishCallback) -> None:
        self._db_factory = db_factory
        self._publish = publish
        self._tick_seconds = get_settings().tick_seconds
        self.settings: SettingsOut = house.initial_settings()
        self.state: HouseState = house.build_house(self.settings.seed)
        self._rng = random.Random(self.settings.seed)
        self._rng_seed = self.settings.seed
        self._automations: list[AutomationOut] = []
        self._thresholds: list[ThresholdOut] = house.default_thresholds()
        self._task: asyncio.Task[None] | None = None
        # Startup only builds the in-memory house and starts the clock. The
        # persisted state is restored by the application lifespan; doing no
        # database work here keeps a slow or locked store from delaying the
        # first served request.
        self._sync_settings()
        self.start()

    @property
    def tick_seconds(self) -> float:
        """Real seconds the configured clock takes per simulated minute at 1x."""

        return self._tick_seconds

    @property
    def tick_interval(self) -> float:
        """Real seconds between two ticks at the currently selected speed."""

        speed = int(self.state.speed)
        if speed < 1:
            speed = 1
        return self._tick_seconds / speed

    def start(self) -> None:
        """Start the background clock when a running event loop is available."""

        if self._task is not None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._task = loop.create_task(self._run_forever(), name="smarthome-simulation")

    async def stop(self) -> None:
        """Stop the background clock (used when the application shuts down)."""

        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    async def _run_forever(self) -> None:
        """Advance the clock once per tick interval until the task is cancelled."""

        while True:
            await asyncio.sleep(self.tick_interval)
            if self.state.paused:
                continue
            try:
                await self.tick()
            except Exception:
                # A failing step must not end the clock: the next tick retries.
                # Only a stable message is logged, never exception details.
                _logger.warning("simulation step failed")

    async def tick(self) -> None:
        """Advance the simulation by exactly one simulated minute."""

        if self.state.paused:
            return
        self._advance_clock()
        self._sync_settings()
        weather.step_weather(self.state, self._rng, 1)
        behavior.step_behavior(self.state, self._rng, 1)
        physics.step_physics(self.state, self._rng, 1)
        self._recalculate_totals()
        self._apply_steps_and_store()
        await self._publish(self.state.model_copy(deep=True))

    def _advance_clock(self) -> None:
        moment = datetime.fromisoformat(self.state.sim_time) + timedelta(minutes=1)
        self.state.sim_time = moment.isoformat(timespec="seconds")
        self.state.weekday = WEEKDAYS[moment.weekday()]
        self.state.tick += 1

    def _recalculate_totals(self) -> None:
        power = round(sum(room.sensors.power_w for room in self.state.rooms), 1)
        solar = round(max(self.state.outdoor.solar_w, 0.0), 1)
        self.state.totals.power_w = power
        self.state.totals.solar_w = solar
        self.state.totals.grid_w = round(power - solar, 1)

    def _apply_steps_and_store(self) -> None:
        # The rules are read in a short session that is closed again before the
        # automation step runs: that step writes through its own session, and a
        # read transaction held across it would block the write.
        rules_session = self._db_factory()
        try:
            automations = self._load_automations(rules_session)
            thresholds = self._load_thresholds(rules_session)
        finally:
            rules_session.close()

        # The automation module changes the state in place, logs each execution
        # and stores its notifying messages itself.
        automation_step.evaluate(self.state, automations, self.state.sim_time)
        messages = alerts.evaluate(self.state, thresholds, self.state.sim_time)

        session = self._db_factory()
        try:
            for message in messages:
                session.merge(self._message_row(message))

            history.record(session, self.state)
            self.state.open_messages = self._count_open_messages(session)
            persistence.save(session, self.state, self.settings)
            session.commit()
            self._automations = automations
            self._thresholds = thresholds
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @staticmethod
    def _message_row(message: MessageOut) -> Message:
        return Message(
            id=message.id,
            kind=message.kind,
            severity=message.severity,
            room_id=message.room_id,
            text=message.text[:500],
            created_at=message.created_at,
            acknowledged_at=message.acknowledged_at,
        )

    @staticmethod
    def _count_open_messages(session: Session) -> int:
        count = session.scalar(
            select(func.count()).select_from(Message).where(Message.acknowledged_at.is_(None))
        )
        return int(count or 0)

    async def set_settings(self, update: SettingsUpdate) -> SettingsOut:
        """Apply the submitted settings to the running simulation immediately."""

        if update.weather is not None:
            self.state.outdoor.weather = update.weather
            self.settings.weather = update.weather
        if update.season is not None:
            self.state.outdoor.season = update.season
            self.settings.season = update.season
            sunrise, sunset = weather.season_daylight(update.season)
            self.state.outdoor.sunrise = sunrise
            self.state.outdoor.sunset = sunset
        if update.occupancy_mode is not None:
            self.settings.occupancy_mode = update.occupancy_mode
        if update.speed is not None:
            self.state.speed = update.speed
            self.settings.speed = int(update.speed)
        if update.seed is not None:
            self.settings.seed = update.seed
            self._rng_seed = update.seed
            self._rng = random.Random(update.seed)
        self._sync_settings()
        self._persist()
        await self._publish(self.state.model_copy(deep=True))
        return self.settings.model_copy(deep=True)

    async def set_paused(self, paused: bool) -> SettingsOut:
        """Pause or resume the running clock."""

        self.state.paused = paused
        self._sync_settings()
        self._persist()
        await self._publish(self.state.model_copy(deep=True))
        return self.settings.model_copy(deep=True)

    async def reset(self, reset_automations: bool, reset_thresholds: bool) -> HouseState:
        """Restore the factory state and optionally the factory automations/thresholds."""

        session = self._db_factory()
        try:
            persistence.reset_store(session, reset_automations, reset_thresholds)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

        self.settings = house.initial_settings()
        self.state = house.build_house(self.settings.seed)
        self._rng_seed = self.settings.seed
        self._rng = random.Random(self.settings.seed)
        self._automations = []
        self._thresholds = house.default_thresholds()
        await self.reload_automations()
        await self.reload_thresholds()
        self._sync_settings()
        self._persist()
        await self._publish(self.state.model_copy(deep=True))
        return self.state.model_copy(deep=True)

    async def trigger_event(self, event_type: str, room_id: str | None) -> MessageOut:
        """Apply a manual event, store its message and publish the new state."""

        message = events.apply(self.state, event_type, room_id, self._rng)
        session = self._db_factory()
        try:
            session.merge(self._message_row(message))
            self.state.open_messages = self._count_open_messages(session)
            persistence.save(session, self.state, self.settings)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
        await self._publish(self.state.model_copy(deep=True))
        return message

    async def reload_automations(self) -> None:
        """Reload automations from the database."""

        session = self._db_factory()
        try:
            self._automations = self._load_automations(session)
        finally:
            session.close()

    async def reload_thresholds(self) -> None:
        """Reload thresholds from the database."""

        session = self._db_factory()
        try:
            self._thresholds = self._load_thresholds(session)
        finally:
            session.close()

    def _sync_settings(self) -> None:
        self.settings.sim_time = self.state.sim_time
        self.settings.weekday = self.state.weekday
        self.settings.paused = self.state.paused
        self.settings.speed = int(self.state.speed)
        self.settings.weather = self.state.outdoor.weather
        self.settings.season = self.state.outdoor.season
        if self.settings.seed != self._rng_seed:
            # The lifespan restores the persisted settings after construction,
            # and a new seed always restarts the reproducible sequence.
            self._rng_seed = self.settings.seed
            self._rng = random.Random(self.settings.seed)
        # The occupant step receives no settings argument, so the engine hands
        # the mode over before every step; that also covers a state and settings
        # restored directly by the lifespan after construction.
        behavior.set_occupancy_mode(self.settings.occupancy_mode)

    def _persist(self) -> None:
        session = self._db_factory()
        try:
            persistence.save(session, self.state, self.settings)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @staticmethod
    def _load_automations(session: Session) -> list[AutomationOut]:
        rows = session.scalars(select(Automation)).all()
        return [
            AutomationOut(
                id=row.id,
                name=row.name,
                enabled=row.enabled,
                condition=ConditionInput(
                    type=row.condition_type,
                    room_id=row.condition_room_id,
                    value=row.condition_value,
                    time=row.condition_time,
                ),
                action=ActionInput(
                    type=row.action_type,
                    room_id=row.action_room_id,
                    device_id=row.action_device_id,
                    value=row.action_value,
                ),
                notify=row.notify,
                created_at=row.created_at,
            )
            for row in rows
        ]

    @staticmethod
    def _load_thresholds(session: Session) -> list[ThresholdOut]:
        stored = {row.key: row for row in session.scalars(select(Threshold)).all()}
        thresholds: list[ThresholdOut] = []
        for default in house.default_thresholds():
            row = stored.get(default.key)
            thresholds.append(
                ThresholdOut(
                    key=default.key,
                    value=row.value if row is not None else default.value,
                    unit=row.unit if row is not None else default.unit,
                    default_value=row.default_value if row is not None else default.default_value,
                )
            )
        return thresholds
