"""Full simulation reset endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import ResetRequest, ResetResult, not_implemented

router = APIRouter(prefix="/api/simulation", tags=["reset"])


@router.post("/reset")
async def reset_simulation(request: ResetRequest) -> ResetResult:
    raise not_implemented()
