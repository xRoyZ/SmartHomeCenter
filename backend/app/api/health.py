"""Health endpoint used by the start contract and the frontend."""

from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    """Report that the service is up and which simulated time it is at."""

    engine = getattr(request.app.state, "engine", None)
    state = getattr(engine, "state", None) if engine is not None else None
    sim_time = state.sim_time if state is not None else ""
    return {"status": "ok", "sim_time": sim_time}
