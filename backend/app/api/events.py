"""Manual event trigger endpoint.

The route validates the event type and the optional room id against the running
engine, applies the event to its state, stores the resulting message and pushes
the updated snapshot to every connected client.
"""

from __future__ import annotations

import random

from fastapi import APIRouter, Request

from ..db import get_session_factory
from ..models import Message as MessageRow
from ..schemas import ApiError, EventRequest, EventResult, MessageOut
from ..simulation import events
from ..ws import manager

router = APIRouter(prefix="/api/events", tags=["events"])


def _store_message(message: MessageOut) -> None:
    """Persist the event message so it appears in the message list."""

    session = get_session_factory()()
    try:
        session.merge(
            MessageRow(
                id=message.id,
                kind=message.kind,
                severity=message.severity,
                room_id=message.room_id,
                text=message.text,
                created_at=message.created_at,
                acknowledged_at=message.acknowledged_at,
            )
        )
        session.commit()
    finally:
        session.close()


def _event_rng(engine: object, event_type: str, room_id: str | None) -> random.Random:
    """Build a reproducible generator from the simulation seed and tick."""

    settings = getattr(engine, "settings", None)
    seed = getattr(settings, "seed", 0)
    state = engine.state
    return random.Random(f"{seed}:{state.tick}:{event_type}:{room_id or 'house'}")


@router.post("/{event_type}", status_code=201)
async def trigger_event(
    event_type: str, request: Request, event: EventRequest | None = None
) -> EventResult:
    if event_type not in events.EVENT_TYPES:
        raise ApiError(404, "unknown_event_type", "Unbekannter Ereignistyp.")

    payload = event or EventRequest()
    engine = request.app.state.engine
    state = engine.state
    if payload.room_id is not None and not any(room.id == payload.room_id for room in state.rooms):
        raise ApiError(404, "unknown_room", "Der Raum wurde nicht gefunden.")

    message = events.apply(
        state, event_type, payload.room_id, _event_rng(engine, event_type, payload.room_id)
    )
    _store_message(message)
    await manager.broadcast(state)
    return EventResult(message=message, state=state)
