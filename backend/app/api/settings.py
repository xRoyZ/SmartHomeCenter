"""Simulation settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import SettingsOut, SettingsUpdate
from ..simulation.engine import SimulationEngine
from .state import engine_of

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings(request: Request) -> SettingsOut:
    """Return the settings of the running simulation."""

    engine: SimulationEngine = engine_of(request)
    return engine.settings.model_copy(deep=True)


@router.put("")
async def update_settings(update: SettingsUpdate, request: Request) -> SettingsOut:
    """Apply submitted settings to the running simulation immediately."""

    engine: SimulationEngine = engine_of(request)
    return await engine.set_settings(update)
