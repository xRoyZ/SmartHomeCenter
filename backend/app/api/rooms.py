"""Room detail endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..schemas import ApiError, RoomDetail, RoomState
from ..simulation.engine import SimulationEngine

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


def _engine(request: Request) -> SimulationEngine:
    """Return the running simulation engine, never the unstarted fallback."""

    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise ApiError(500, "internal_error", "Die Simulation ist nicht gestartet.")
    return engine


def find_room(room_id: str, request: Request) -> RoomState:
    """Look up a room of the running house or answer ``unknown_room``."""

    engine = _engine(request)
    for room in engine.state.rooms:
        if room.id == room_id:
            return room
    raise ApiError(404, "unknown_room", "Der Raum wurde nicht gefunden.")


@router.get("/{room_id}")
async def get_room(room_id: str, request: Request) -> RoomDetail:
    """Return one room with its sensors, devices and German status text."""

    room = find_room(room_id, request)
    return RoomDetail(room=room, devices=room.devices)
