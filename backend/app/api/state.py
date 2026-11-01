"""Current house state."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import HouseState, not_implemented

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
async def get_state() -> HouseState:
    raise not_implemented()
