"""Simulation control endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import SettingsOut, SimulationControl, not_implemented

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/control")
async def control_simulation(command: SimulationControl) -> SettingsOut:
    raise not_implemented()
