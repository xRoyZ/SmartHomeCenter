"""Threshold list and update endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import ThresholdOut, ThresholdUpdate, not_implemented

router = APIRouter(prefix="/api/thresholds", tags=["thresholds"])


@router.get("")
async def get_thresholds() -> list[ThresholdOut]:
    raise not_implemented()


@router.put("/{key}")
async def update_threshold(key: str, update: ThresholdUpdate) -> ThresholdOut:
    raise not_implemented()
