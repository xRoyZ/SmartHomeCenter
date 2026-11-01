"""Current house state."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import ApiError, HouseState
from ..simulation.engine import SimulationEngine

router = APIRouter(prefix="/api", tags=["state"])


def engine_of(request: Request) -> SimulationEngine:
    """Return the running simulation engine of the application."""

    engine = getattr(request.app.state, "engine", None)
    if not isinstance(engine, SimulationEngine):
        raise ApiError(503, "internal_error", "Die Simulation ist noch nicht bereit.")
    return engine


@router.get("/state")
async def get_state(request: Request) -> HouseState:
    """Return the current snapshot of the whole house."""

    return engine_of(request).state.model_copy(deep=True)
