"""Threshold list and update endpoints.

The stored values are the single source the next alert evaluation reads. Every
update is validated against the key's range before anything is written, so a
rejected request changes neither SQLite nor the running simulation (AC-26), and
the engine reloads its cached thresholds so the change applies immediately
(AC-09). Only the ORM is used (AC-27).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Threshold
from ..schemas import ApiError, ThresholdOut, ThresholdUpdate
from ..simulation import house

router = APIRouter(prefix="/api/thresholds", tags=["thresholds"])

_RANGES: dict[str, tuple[float, float]] = {
    "min_temperature": (5.0, 25.0),
    "max_temperature": (20.0, 35.0),
    "max_co2": (500.0, 2500.0),
    "max_power": (500.0, 8000.0),
    "power_spike_delta": (100.0, 10000.0),
}

_LABELS: dict[str, str] = {
    "min_temperature": "Die Mindesttemperatur",
    "max_temperature": "Die Höchsttemperatur",
    "max_co2": "Der CO₂-Grenzwert",
    "max_power": "Die Leistungsgrenze",
    "power_spike_delta": "Die Grenze für Stromspitzen",
}


def _defaults() -> dict[str, ThresholdOut]:
    return {threshold.key: threshold for threshold in house.default_thresholds()}


def _ensure_defaults(session: Session) -> None:
    """Create any missing factory threshold so a fresh database is usable."""

    existing = set(session.scalars(select(Threshold.key)))
    created = False
    for key, default in _defaults().items():
        if key in existing:
            continue
        session.add(
            Threshold(
                key=key,
                value=default.value,
                unit=default.unit,
                default_value=default.default_value,
            )
        )
        created = True
    if created:
        session.commit()


def _to_out(row: Threshold) -> ThresholdOut:
    return ThresholdOut(
        key=row.key,
        value=row.value,
        unit=row.unit,
        default_value=row.default_value,
    )


def _unknown() -> ApiError:
    return ApiError(404, "unknown_threshold", "Der Schwellwert wurde nicht gefunden.")


def _invalid(key: str, low: float, high: float) -> ApiError:
    label = _LABELS.get(key, "Der Schwellwert")
    return ApiError(
        422,
        "validation_error",
        f"{label} muss zwischen {low:g} und {high:g} liegen.",
    )


async def _reload(request: Request) -> None:
    engine = getattr(request.app.state, "engine", None)
    if engine is not None:
        await engine.reload_thresholds()


@router.get("")
async def get_thresholds(session: Session = Depends(get_session)) -> list[ThresholdOut]:
    _ensure_defaults(session)
    rows = {row.key: row for row in session.scalars(select(Threshold))}
    return [_to_out(rows[key]) for key in _defaults() if key in rows]


@router.put("/{key}")
async def update_threshold(
    key: str,
    update: ThresholdUpdate,
    request: Request,
    session: Session = Depends(get_session),
) -> ThresholdOut:
    if key not in _RANGES:
        raise _unknown()

    low, high = _RANGES[key]
    if not low <= update.value <= high:
        raise _invalid(key, low, high)

    row = session.get(Threshold, key)
    if row is None:
        default = _defaults()[key]
        row = Threshold(
            key=key,
            value=default.value,
            unit=default.unit,
            default_value=default.default_value,
        )
        session.add(row)

    row.value = update.value
    session.commit()
    await _reload(request)
    return _to_out(row)
