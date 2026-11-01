"""Device detail and device control endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import DeviceCommand, DeviceDetail, not_implemented

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("/{device_id}")
async def get_device(device_id: str) -> DeviceDetail:
    raise not_implemented()


@router.put("/{device_id}/state")
async def set_device_state(device_id: str, command: DeviceCommand) -> DeviceDetail:
    raise not_implemented()
