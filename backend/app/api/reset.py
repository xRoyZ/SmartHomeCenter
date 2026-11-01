"""Full simulation reset endpoint.

The route clears messages, executions and readings, restores the initial house
and simulated time (optionally together with the factory automations and
thresholds), hands the restored state to the running engine and broadcasts the
fresh snapshot to every connected client.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..db import session_scope
from ..schemas import ResetRequest, ResetResult
from ..simulation import house, persistence
from ..ws import manager

router = APIRouter(prefix="/api/simulation", tags=["reset"])


@router.post("/reset")
async def reset_simulation(payload: ResetRequest, request: Request) -> ResetResult:
    engine = request.app.state.engine

    with session_scope() as session:
        persistence.reset_store(
            session,
            payload.reset_automations,
            payload.reset_thresholds,
        )
        restored = persistence.load(session)

    if restored is None:
        state = house.build_house(house.DEFAULT_SEED)
        settings = house.initial_settings()
    else:
        state, settings = restored

    engine.state = state
    engine.settings = settings

    if payload.reset_automations:
        await engine.reload_automations()
    if payload.reset_thresholds:
        await engine.reload_thresholds()

    await manager.broadcast(state)
    return ResetResult(state=state, settings=settings)
