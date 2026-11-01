"""Message list and acknowledgement endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter

from ..schemas import MessageOut, not_implemented

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
async def get_messages(
    status: Literal["open", "acknowledged", "all"] = "open",
) -> list[MessageOut]:
    raise not_implemented()


@router.post("/{message_id}/ack")
async def acknowledge_message(message_id: str) -> MessageOut:
    raise not_implemented()
