"""Automation CRUD and execution log endpoints.

Every write validates the typed input against the live house (known rooms and
devices, value ranges) before it touches the store, so a rejected request
changes neither the simulation state nor SQLite (AC-21, AC-26). Only the ORM
is used, never raw SQL text (AC-27).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Automation, AutomationLog
from ..schemas import (
    ActionInput,
    ApiError,
    AutomationInput,
    AutomationOut,
    ConditionInput,
    ExecutionOut,
    HouseState,
)
from ..simulation import house
from ..simulation.automation import validate_automation

router = APIRouter(prefix="/api/automations", tags=["automations"])


def _sim_time(request: Request) -> str:
    engine = getattr(request.app.state, "engine", None)
    state = getattr(engine, "state", None) if engine is not None else None
    if state is not None:
        return state.sim_time
    return house.DEFAULT_START_TIME


def _house_state(request: Request) -> HouseState:
    engine = getattr(request.app.state, "engine", None)
    state = getattr(engine, "state", None) if engine is not None else None
    if state is not None:
        return state
    return house.build_house(house.DEFAULT_SEED)


async def _reload(request: Request) -> None:
    engine = getattr(request.app.state, "engine", None)
    if engine is not None:
        await engine.reload_automations()


def _unknown() -> ApiError:
    return ApiError(404, "unknown_automation", "Die Automation wurde nicht gefunden.")


def _to_out(row: Automation) -> AutomationOut:
    return AutomationOut(
        id=row.id,
        name=row.name,
        enabled=row.enabled,
        condition=ConditionInput(
            type=row.condition_type,
            room_id=row.condition_room_id,
            value=row.condition_value,
            time=row.condition_time,
        ),
        action=ActionInput(
            type=row.action_type,
            room_id=row.action_room_id,
            device_id=row.action_device_id,
            value=row.action_value,
        ),
        notify=row.notify,
        created_at=row.created_at,
    )


def _apply_input(row: Automation, automation: AutomationInput) -> None:
    row.name = automation.name
    row.enabled = automation.enabled
    row.condition_type = automation.condition.type
    row.condition_room_id = automation.condition.room_id
    row.condition_value = automation.condition.value
    row.condition_time = automation.condition.time
    row.action_type = automation.action.type
    row.action_room_id = automation.action.room_id
    row.action_device_id = automation.action.device_id
    row.action_value = automation.action.value
    row.notify = automation.notify


@router.get("")
async def get_automations(session: Session = Depends(get_session)) -> list[AutomationOut]:
    rows = session.scalars(
        select(Automation).order_by(Automation.created_at, Automation.name, Automation.id)
    )
    return [_to_out(row) for row in rows]


@router.post("", status_code=201)
async def create_automation(
    automation: AutomationInput,
    request: Request,
    session: Session = Depends(get_session),
) -> AutomationOut:
    validate_automation(_house_state(request), automation)

    row = Automation(
        id=uuid.uuid4().hex,
        created_at=_sim_time(request),
    )
    _apply_input(row, automation)
    session.add(row)
    session.commit()
    await _reload(request)
    return _to_out(row)


@router.put("/{automation_id}")
async def update_automation(
    automation_id: str,
    automation: AutomationInput,
    request: Request,
    session: Session = Depends(get_session),
) -> AutomationOut:
    row = session.get(Automation, automation_id)
    if row is None:
        raise _unknown()

    validate_automation(_house_state(request), automation)

    _apply_input(row, automation)
    session.commit()
    await _reload(request)
    return _to_out(row)


@router.delete("/{automation_id}", status_code=204)
async def delete_automation(
    automation_id: str,
    request: Request,
    session: Session = Depends(get_session),
) -> None:
    row = session.get(Automation, automation_id)
    if row is None:
        raise _unknown()

    session.execute(delete(AutomationLog).where(AutomationLog.automation_id == automation_id))
    session.delete(row)
    session.commit()
    await _reload(request)


@router.get("/{automation_id}/executions")
async def get_executions(
    automation_id: str,
    session: Session = Depends(get_session),
) -> list[ExecutionOut]:
    row = session.get(Automation, automation_id)
    if row is None:
        raise _unknown()

    logs = session.scalars(
        select(AutomationLog)
        .where(AutomationLog.automation_id == automation_id)
        .order_by(AutomationLog.sim_time.desc(), AutomationLog.id.desc())
    )
    return [
        ExecutionOut(
            id=log.id,
            automation_id=log.automation_id,
            automation_name=row.name,
            sim_time=log.sim_time,
            text=log.text,
        )
        for log in logs
    ]
