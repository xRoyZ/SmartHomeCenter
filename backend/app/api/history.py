"""History query and CSV export endpoints."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from ..schemas import (
    HistoryMetric,
    HistoryMetricSelection,
    HistorySeries,
    HistoryWindow,
    not_implemented,
)

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def get_history(room_id: str, metric: HistoryMetric, window: HistoryWindow) -> HistorySeries:
    raise not_implemented()


@router.get("/export")
async def export_history(
    room_id: str, metric: HistoryMetricSelection, window: HistoryWindow
) -> Response:
    raise not_implemented()
