"""Simulation control endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import SettingsOut, SimulationControl
from ..simulation.engine import SimulationEngine
from .state import engine_of

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/control")
async def control_simulation(command: SimulationControl, request: Request) -> SettingsOut:
    """Pause or resume the running simulation clock."""

    engine: SimulationEngine = engine_of(request)
    return await engine.set_paused(command.action == "pause")
