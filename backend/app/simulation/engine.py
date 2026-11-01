"""The simulation engine.

The skeleton owns the public shape of :class:`SimulationEngine` and the initial
state. The tick loop, settings, reset and event handling are filled in by the
simulation tickets; the engine already holds a valid house so live snapshots are
available from the first WebSocket connection.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from ..schemas import HouseState, MessageOut, SettingsOut, SettingsUpdate
from . import house

PublishCallback = Callable[[HouseState], Awaitable[None]]


class SimulationEngine:
    """Owns the mutable simulation state and publishes snapshots to clients."""

    def __init__(self, db_factory: Callable[[], Any], publish: PublishCallback) -> None:
        self._db_factory = db_factory
        self._publish = publish
        self.settings: SettingsOut = house.initial_settings()
        self.state: HouseState = house.build_house(self.settings.seed)

    async def tick(self) -> None:
        """Advance the simulation by one tick (implemented by the clock ticket)."""

    async def set_settings(self, update: SettingsUpdate) -> SettingsOut:
        raise NotImplementedError("settings are implemented by the simulation ticket")

    async def reset(self, reset_automations: bool, reset_thresholds: bool) -> HouseState:
        raise NotImplementedError("reset is implemented by the persistence ticket")

    async def trigger_event(self, event_type: str, room_id: str | None) -> MessageOut:
        raise NotImplementedError("events are implemented by the events ticket")

    async def reload_automations(self) -> None:
        """Reload automations from the database (implemented by the automation ticket)."""

    async def reload_thresholds(self) -> None:
        """Reload thresholds from the database (implemented by the alerts ticket)."""
