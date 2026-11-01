"""Manual event trigger endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import EventRequest, EventResult, not_implemented

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("/{event_type}", status_code=201)
async def trigger_event(event_type: str, event: EventRequest) -> EventResult:
    raise not_implemented()
