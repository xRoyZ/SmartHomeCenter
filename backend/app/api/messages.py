"""Message list and acknowledgement endpoints.

Open messages are the ones without an acknowledgement time. Acknowledging a
message only records when it happened: it disappears from the open list but
stays visible in ``status=all`` and ``status=acknowledged`` (AC-08). Every query
goes through the ORM (AC-27).
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Message as MessageRow
from ..models import Room
from ..schemas import ApiError, MessageOut
from ..simulation import house

router = APIRouter(prefix="/api/messages", tags=["messages"])

MessageStatus = Literal["open", "acknowledged", "all"]


def _sim_time(request: Request) -> str:
    engine = getattr(request.app.state, "engine", None)
    state = getattr(engine, "state", None) if engine is not None else None
    if state is not None:
        return state.sim_time
    return house.DEFAULT_START_TIME


def _to_out(row: MessageRow, room_name: str | None) -> MessageOut:
    return MessageOut(
        id=row.id,
        kind=row.kind,
        severity=row.severity,
        room_id=row.room_id,
        room_name=room_name,
        text=row.text,
        created_at=row.created_at,
        acknowledged_at=row.acknowledged_at,
    )


def _filtered(statement: Select[tuple[MessageRow, str | None]], status: MessageStatus) -> Select:
    if status == "open":
        return statement.where(MessageRow.acknowledged_at.is_(None))
    if status == "acknowledged":
        return statement.where(MessageRow.acknowledged_at.is_not(None))
    return statement


@router.get("")
async def get_messages(
    status: MessageStatus = "open",
    session: Session = Depends(get_session),
) -> list[MessageOut]:
    statement = select(MessageRow, Room.name).outerjoin(Room, Room.id == MessageRow.room_id)
    statement = _filtered(statement, status).order_by(
        MessageRow.created_at.desc(), MessageRow.id.desc()
    )
    rows = session.execute(statement).all()
    return [_to_out(row, room_name) for row, room_name in rows]


@router.post("/{message_id}/ack")
async def acknowledge_message(
    message_id: str,
    request: Request,
    session: Session = Depends(get_session),
) -> MessageOut:
    row = session.get(MessageRow, message_id)
    if row is None:
        raise ApiError(404, "unknown_message", "Die Meldung wurde nicht gefunden.")

    if row.acknowledged_at is None:
        row.acknowledged_at = _sim_time(request)
        session.commit()

    room = session.get(Room, row.room_id) if row.room_id is not None else None
    return _to_out(row, room.name if room is not None else None)
