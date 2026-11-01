"""History query and CSV export endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import ApiError, HistorySeries
from ..simulation import history

router = APIRouter(prefix="/api/history", tags=["history"])


def _require(value: str | None) -> str:
    if value is None or not value.strip():
        raise ApiError(400, "invalid_query", "Ungültige Anfrage.")
    return value.strip()


@router.get("")
async def get_history(
    room_id: str | None = None,
    metric: str | None = None,
    window: str | None = None,
    session: Session = Depends(get_session),
) -> HistorySeries:
    """Return the stored readings of one room and metric for a time window."""

    return history.query(
        session,
        _require(room_id),
        _require(metric),
        _require(window),
    )


@router.get("/export")
async def export_history(
    room_id: str | None = None,
    metric: str | None = None,
    window: str | None = None,
    session: Session = Depends(get_session),
) -> Response:
    """Download the stored readings of one room and time window as CSV."""

    filename, text = history.export(
        session,
        _require(room_id),
        _require(metric),
        _require(window),
    )
    return Response(
        content=text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
