"""Room detail endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import RoomDetail, not_implemented

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.get("/{room_id}")
async def get_room(room_id: str) -> RoomDetail:
    raise not_implemented()
