"""History recording, query and CSV export.

Every simulated minute the engine hands the current house state to
:func:`record`, which stores one ORM row per room and metric. Queries read only
those stored rows; the CSV export is built locally with the standard library.

All database access goes through the ORM or parameterised statements, so no
user-supplied value ever reaches SQL text (AC-27).
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..models import Reading
from ..schemas import ApiError, HistoryMetric, HistoryPoint, HistorySeries, HouseState
from . import house

RETENTION = timedelta(days=1)

METRICS: tuple[HistoryMetric, ...] = ("temperature", "humidity", "co2", "power")

METRIC_UNITS: dict[HistoryMetric, str] = {
    "temperature": "°C",
    "humidity": "%",
    "co2": "ppm",
    "power": "W",
}

METRIC_FILE_NAMES: dict[HistoryMetric, str] = {
    "temperature": "temperatur",
    "humidity": "luftfeuchte",
    "co2": "co2",
    "power": "verbrauch",
}

WINDOW_DELTAS: dict[str, timedelta] = {
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
}

_INVALID_QUERY = "Ungültige Anfrage."
_UNKNOWN_ROOM = "Unbekannter Raum."


def _invalid(message: str = _INVALID_QUERY) -> ApiError:
    return ApiError(400, "invalid_query", message)


def _room_name(room_id: str) -> str:
    """Return the canonical German name of a known room or raise an API error."""

    for known_id, name, *_ in house.ROOM_DEFINITIONS:
        if known_id == room_id:
            return name
    raise _invalid(_UNKNOWN_ROOM)


def _room_slug(room_id: str) -> str:
    """Return a file-name-safe slug of the room name (ASCII, lower case)."""

    name = _room_name(room_id).lower()
    for source, target in (
        ("ä", "ae"),
        ("ö", "oe"),
        ("ü", "ue"),
        ("ß", "ss"),
    ):
        name = name.replace(source, target)
    slug = "".join(character if character.isalnum() else "_" for character in name)
    slug = "_".join(part for part in slug.split("_") if part)
    return slug or "raum"


def _validate_metric(metric: str) -> str:
    if metric not in METRICS:
        raise _invalid()
    return metric


def _validate_window(window: str) -> str:
    if window not in WINDOW_DELTAS:
        raise _invalid()
    return window


def _parse(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise _invalid() from exc


def _window_start(latest: str, window: str) -> str:
    return (_parse(latest) - WINDOW_DELTAS[window]).isoformat(timespec="seconds")


def _latest_sim_time(session: Session, room_id: str, metrics: tuple[str, ...]) -> str | None:
    statement = select(func.max(Reading.sim_time)).where(
        Reading.room_id == room_id,
        Reading.metric.in_(metrics),
    )
    return session.execute(statement).scalar_one_or_none()


def _format_value(value: float) -> str:
    """Format a reading for CSV: decimal point and the stored value exactly."""

    text = repr(float(value))
    if "e" in text or "E" in text or "." not in text:
        text = f"{value:.6f}".rstrip("0").rstrip(".")
        if "." not in text:
            text += ".0"
    return text


def readings(state: HouseState) -> list[Reading]:
    """Return the reading rows of the current simulated minute, one per room and metric."""

    rows: list[Reading] = []
    for room in state.rooms:
        values: dict[HistoryMetric, float] = {
            "temperature": room.sensors.temperature,
            "humidity": room.sensors.humidity,
            "co2": room.sensors.co2,
            "power": room.sensors.power_w,
        }
        for metric, value in values.items():
            rows.append(
                Reading(
                    room_id=room.id,
                    metric=metric,
                    value=float(value),
                    sim_time=state.sim_time,
                )
            )
    return rows


def store(session: Session, rows: list[Reading]) -> None:
    """Add reading rows that are not stored yet and prune expired ones (no commit).

    A row whose room, metric and simulated minute is already stored is skipped,
    so a minute that is recorded twice keeps one point.
    """

    if not rows:
        return
    minutes = [_parse(row.sim_time).replace(second=0, microsecond=0) for row in rows]
    first, last = min(minutes), max(minutes) + timedelta(minutes=1)
    stored = {
        (room_id, metric, _parse(sim_time).replace(second=0, microsecond=0))
        for room_id, metric, sim_time in session.execute(
            select(Reading.room_id, Reading.metric, Reading.sim_time).where(
                Reading.sim_time >= first.isoformat(timespec="seconds"),
                Reading.sim_time < last.isoformat(timespec="seconds"),
            )
        ).all()
    }
    fresh: list[Reading] = []
    for row, minute in zip(rows, minutes, strict=True):
        key = (row.room_id, row.metric, minute)
        if key in stored:
            continue
        stored.add(key)
        fresh.append(row)
    if fresh:
        session.add_all(fresh)

    cutoff = (max(minutes) - RETENTION).isoformat(timespec="seconds")
    session.execute(delete(Reading).where(Reading.sim_time < cutoff))


def record(session: Session, state: HouseState) -> None:
    """Store one reading per room and metric for the current simulated minute."""

    store(session, readings(state))
    session.commit()


def query(session: Session, room_id: str, metric: str, window: str) -> HistorySeries:
    """Return the stored readings of one room and metric for a time window."""

    _room_name(room_id)
    selected_metric = _validate_metric(metric)
    selected_window = _validate_window(window)

    series = HistorySeries(
        room_id=room_id,
        metric=selected_metric,
        window=selected_window,
        unit=METRIC_UNITS[selected_metric],
        points=[],
    )

    latest = _latest_sim_time(session, room_id, (selected_metric,))
    if latest is None:
        return series

    start = _window_start(latest, selected_window)
    statement = (
        select(Reading.sim_time, Reading.value)
        .where(
            Reading.room_id == room_id,
            Reading.metric == selected_metric,
            Reading.sim_time >= start,
        )
        .order_by(Reading.sim_time, Reading.id)
    )
    series.points = [
        HistoryPoint(t=sim_time, value=float(value))
        for sim_time, value in session.execute(statement).all()
    ]
    return series


def _all_metric_rows(session: Session, room_id: str, window: str) -> list[list[str]]:
    latest = _latest_sim_time(session, room_id, METRICS)
    if latest is None:
        return []

    start = _window_start(latest, window)
    statement = (
        select(Reading.sim_time, Reading.metric, Reading.value)
        .where(
            Reading.room_id == room_id,
            Reading.metric.in_(METRICS),
            Reading.sim_time >= start,
        )
        .order_by(Reading.sim_time, Reading.id)
    )

    by_timestamp: dict[str, dict[str, float]] = {}
    for sim_time, metric, value in session.execute(statement).all():
        by_timestamp.setdefault(sim_time, {})[metric] = float(value)

    return [
        [sim_time]
        + [
            _format_value(by_timestamp[sim_time][metric])
            if metric in by_timestamp[sim_time]
            else ""
            for metric in METRICS
        ]
        for sim_time in sorted(by_timestamp)
    ]


def export(session: Session, room_id: str, metric: str, window: str) -> tuple[str, str]:
    """Return the CSV filename and content for one room and time window."""

    _room_name(room_id)
    selected_window = _validate_window(window)
    slug = _room_slug(room_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")

    if metric == "all":
        header = ["zeit"] + [f"{METRIC_FILE_NAMES[item]}_{METRIC_UNITS[item]}" for item in METRICS]
        rows = _all_metric_rows(session, room_id, selected_window)
        filename = f"{slug}_alle-messgroessen_{selected_window}.csv"
    else:
        selected_metric = _validate_metric(metric)
        series = query(session, room_id, selected_metric, selected_window)
        header = [
            "zeit",
            f"{METRIC_FILE_NAMES[selected_metric]}_{METRIC_UNITS[selected_metric]}",
        ]
        rows = [[point.t, _format_value(point.value)] for point in series.points]
        filename = f"{slug}_{METRIC_FILE_NAMES[selected_metric]}_{selected_window}.csv"

    writer.writerow(header)
    writer.writerows(rows)

    # A UTF-8 byte-order mark makes spreadsheet programs read the degree sign
    # and umlauts correctly without any post-processing.
    return filename, "\ufeff" + buffer.getvalue()
