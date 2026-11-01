"""History recording and query behaviour plus the history HTTP routes."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base, Reading
from app.schemas import ApiError, HouseState
from app.simulation import history, house


@pytest.fixture()
def session(tmp_path) -> Iterator[Session]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'history.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    with factory() as db_session:
        yield db_session
    engine.dispose()


def _state(sim_time: str) -> HouseState:
    state = house.build_house(house.DEFAULT_SEED)
    state.sim_time = sim_time
    return state


def test_record_writes_one_row_per_room_and_metric(session: Session) -> None:
    state = _state("2026-06-15T08:00:00")

    history.record(session, state)

    count = session.scalar(select(func.count()).select_from(Reading))
    assert count == len(state.rooms) * 4
    metrics = set(session.scalars(select(Reading.metric)).all())
    assert metrics == {"temperature", "humidity", "co2", "power"}


def test_record_does_not_duplicate_rows_for_the_same_simulated_minute(
    session: Session,
) -> None:
    state = _state("2026-06-15T08:00:00")
    history.record(session, state)

    state.rooms[0].sensors.temperature = 99.0
    history.record(session, state)

    count = session.scalar(select(func.count()).select_from(Reading))
    assert count == len(state.rooms) * 4


def test_record_keeps_one_row_per_simulated_minute(session: Session) -> None:
    history.record(session, _state("2026-06-15T08:00:10"))
    history.record(session, _state("2026-06-15T08:00:50"))

    count = session.scalar(select(func.count()).select_from(Reading))
    assert count == len(house.build_house(house.DEFAULT_SEED).rooms) * 4
    stored_times = set(session.scalars(select(Reading.sim_time)).all())
    assert stored_times == {"2026-06-15T08:00:10"}


def test_record_prunes_rows_older_than_the_retention_window(session: Session) -> None:
    history.record(session, _state("2026-06-13T08:00:00"))
    history.record(session, _state("2026-06-15T08:00:00"))

    stored_times = set(session.scalars(select(Reading.sim_time)).all())
    assert stored_times == {"2026-06-15T08:00:00"}


def test_query_returns_the_recorded_points(session: Session) -> None:
    state = _state("2026-06-15T08:00:00")
    history.record(session, state)

    series = history.query(session, "living_room", "temperature", "1h")

    assert series.room_id == "living_room"
    assert series.metric == "temperature"
    assert series.window == "1h"
    assert series.unit == "°C"
    assert [point.t for point in series.points] == ["2026-06-15T08:00:00"]
    expected = next(room for room in state.rooms if room.id == "living_room")
    assert series.points[0].value == pytest.approx(expected.sensors.temperature)


def test_query_limits_points_to_the_selected_window(session: Session) -> None:
    for sim_time in ("2026-06-15T08:00:00", "2026-06-15T08:20:00", "2026-06-15T08:40:00"):
        history.record(session, _state(sim_time))

    last_15_minutes = history.query(session, "living_room", "temperature", "15m")
    last_hour = history.query(session, "living_room", "temperature", "1h")
    last_day = history.query(session, "living_room", "temperature", "1d")

    assert [point.t for point in last_15_minutes.points] == ["2026-06-15T08:40:00"]
    assert [point.t for point in last_hour.points] == [
        "2026-06-15T08:00:00",
        "2026-06-15T08:20:00",
        "2026-06-15T08:40:00",
    ]
    assert len(last_day.points) == 3


def test_query_without_readings_returns_an_empty_series(session: Session) -> None:
    series = history.query(session, "living_room", "humidity", "15m")

    assert series.points == []
    assert series.unit == "%"


@pytest.mark.parametrize(
    ("room_id", "metric", "window"),
    [
        ("attic", "temperature", "1h"),
        ("living_room", "pressure", "1h"),
        ("living_room", "temperature", "2h"),
        ("living_room", "all", "1h"),
    ],
)
def test_query_rejects_invalid_selections(
    session: Session, room_id: str, metric: str, window: str
) -> None:
    with pytest.raises(ApiError) as excinfo:
        history.query(session, room_id, metric, window)

    assert excinfo.value.status_code == 400
    assert excinfo.value.code == "invalid_query"


def _seed_route_history() -> None:
    from app import db

    state = _state("2026-06-15T08:00:00")
    with db.session_scope() as db_session:
        history.record(db_session, state)


def test_history_route_returns_a_series(client: TestClient) -> None:
    _seed_route_history()

    response = client.get(
        "/api/history",
        params={"room_id": "living_room", "metric": "temperature", "window": "1h"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["room_id"] == "living_room"
    assert body["metric"] == "temperature"
    assert body["window"] == "1h"
    assert body["unit"] == "°C"
    assert len(body["points"]) == 1


@pytest.mark.parametrize(
    "params",
    [
        {"metric": "temperature", "window": "1h"},
        {"room_id": "attic", "metric": "temperature", "window": "1h"},
        {"room_id": "living_room", "metric": "pressure", "window": "1h"},
        {"room_id": "living_room", "metric": "temperature", "window": "2h"},
        {"room_id": "living_room", "metric": "all", "window": "1h"},
        {"room_id": "living_room", "metric": "temperature"},
    ],
)
def test_history_route_answers_invalid_query(client: TestClient, params: dict) -> None:
    response = client.get("/api/history", params=params)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_query"


def test_history_route_uses_parameters_instead_of_sql_text(client: TestClient) -> None:
    malicious = "living_room'); DROP TABLE readings;--"

    response = client.get(
        "/api/history",
        params={"room_id": malicious, "metric": "temperature", "window": "1h"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_query"
    # The readings table survived: a valid query still reaches it.
    assert (
        client.get(
            "/api/history",
            params={"room_id": "living_room", "metric": "temperature", "window": "1h"},
        ).status_code
        == 200
    )
