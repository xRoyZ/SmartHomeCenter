"""Tests for the demo seed command (AC-20)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app import db
from app import seed as seed_module
from app.db import get_session_factory
from app.models import Automation, Device, Message, Reading, Room, Threshold
from app.simulation import house

TABLES = (Room, Device, Reading, Message, Automation, Threshold)


@pytest.fixture()
def seeded_database(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("SMARTHOME_DB_PATH", str(tmp_path / "seed.db"))
    db.reset_engine()
    try:
        yield
    finally:
        db.reset_engine()


def _count(model: type) -> int:
    with get_session_factory()() as session:
        return int(session.scalar(select(func.count()).select_from(model)) or 0)


def _snapshot() -> dict[str, list[tuple]]:
    snapshot: dict[str, list[tuple]] = {}
    with get_session_factory()() as session:
        for model in TABLES:
            columns = list(model.__table__.columns)
            rows = session.execute(select(*columns)).all()
            snapshot[model.__tablename__] = sorted((tuple(row) for row in rows), key=repr)
    return snapshot


def test_seed_populates_the_demo_house(seeded_database: None) -> None:
    seed_module.seed()

    expected = house.build_house(house.DEFAULT_SEED)
    assert _count(Room) == len(expected.rooms)
    assert _count(Device) == sum(len(room.devices) for room in expected.rooms)
    assert _count(Threshold) == len(house.default_thresholds())
    assert _count(Automation) == len(house.default_automations())
    assert _count(Message) >= 4
    assert _count(Reading) >= len(expected.rooms) * len(seed_module.METRICS) * 288


def test_seed_stores_messages_of_different_kinds_and_severities(
    seeded_database: None,
) -> None:
    seed_module.seed()

    with get_session_factory()() as session:
        messages = session.scalars(select(Message)).all()
        kinds = {message.kind for message in messages}
        severities = {message.severity for message in messages}
        acknowledged = [message for message in messages if message.acknowledged_at]

    assert len(kinds) >= 3
    assert len(severities) >= 2
    assert acknowledged


def test_seed_stores_a_day_of_history_per_room_and_metric(
    seeded_database: None,
) -> None:
    seed_module.seed()

    expected = house.build_house(house.DEFAULT_SEED)
    with get_session_factory()() as session:
        for room in expected.rooms:
            for metric in seed_module.METRICS:
                rows = session.scalars(
                    select(Reading).where(Reading.room_id == room.id, Reading.metric == metric)
                ).all()
                assert len(rows) >= 288
                times = sorted(datetime.fromisoformat(row.sim_time) for row in rows)
                assert times[-1] - times[0] >= timedelta(hours=23)


def test_second_run_changes_nothing_and_exits_zero(seeded_database: None) -> None:
    assert seed_module.main() == 0
    first = _snapshot()

    assert seed_module.main() == 0
    second = _snapshot()

    assert second == first
