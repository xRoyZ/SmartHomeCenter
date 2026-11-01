"""Simulation settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import SettingsOut, SettingsUpdate, not_implemented

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_settings() -> SettingsOut:
    raise not_implemented()


@router.put("")
async def update_settings(update: SettingsUpdate) -> SettingsOut:
    raise not_implemented()
