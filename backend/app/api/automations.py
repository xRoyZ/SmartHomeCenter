"""Automation CRUD and execution log endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from ..schemas import AutomationInput, AutomationOut, ExecutionOut, not_implemented

router = APIRouter(prefix="/api/automations", tags=["automations"])


@router.get("")
async def get_automations() -> list[AutomationOut]:
    raise not_implemented()


@router.post("", status_code=201)
async def create_automation(automation: AutomationInput) -> AutomationOut:
    raise not_implemented()


@router.put("/{automation_id}")
async def update_automation(automation_id: str, automation: AutomationInput) -> AutomationOut:
    raise not_implemented()


@router.delete("/{automation_id}", status_code=204)
async def delete_automation(automation_id: str) -> None:
    raise not_implemented()


@router.get("/{automation_id}/executions")
async def get_executions(automation_id: str) -> list[ExecutionOut]:
    raise not_implemented()
