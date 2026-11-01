"""CSV export content, layout and HTTP download behaviour."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base
from app.schemas import ApiError
from app.simulation import history, house


@pytest.fixture()
def session(tmp_path) -> Iterator[Session]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'export.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    with factory() as db_session:
        yield db_session
    engine.dispose()


def _record_living_room(
    session: Session,
    sim_time: str,
    temperature: float,
    humidity: float = 48.0,
    co2: float = 620.0,
    power: float = 100.0,
) -> None:
    state = house.build_house(house.DEFAULT_SEED)
    state.sim_time = sim_time
    for room in state.rooms:
        if room.id == "living_room":
            room.sensors.temperature = temperature
            room.sensors.humidity = humidity
            room.sensors.co2 = co2
            room.sensors.power_w = power
    history.record(session, state)


def test_single_metric_export_has_header_and_one_row_per_point(session: Session) -> None:
    _record_living_room(session, "2026-06-15T08:00:00", 21.5)
    _record_living_room(session, "2026-06-15T08:10:00", 22.25)

    filename, text = history.export(session, "living_room", "temperature", "1h")

    assert filename == "wohnzimmer_temperatur_1h.csv"
    assert text.startswith("\ufeff")
    lines = text.lstrip("\ufeff").splitlines()
    assert lines[0] == "zeit,temperatur_°C"
    assert lines[1] == "2026-06-15T08:00:00,21.5"
    assert lines[2] == "2026-06-15T08:10:00,22.25"
    assert len(lines) == 3


def test_export_uses_a_decimal_point_not_a_comma(session: Session) -> None:
    _record_living_room(session, "2026-06-15T08:00:00", 21.5, humidity=48.25)

    _, temperature_csv = history.export(session, "living_room", "temperature", "1h")
    _, humidity_csv = history.export(session, "living_room", "humidity", "1h")

    assert "21.5" in temperature_csv
    assert "48.25" in humidity_csv
    assert "48,25" not in humidity_csv


def test_all_metric_export_uses_one_row_per_timestamp(session: Session) -> None:
    _record_living_room(session, "2026-06-15T08:00:00", 21.5, 48.0, 620.0, 100.0)
    _record_living_room(session, "2026-06-15T08:10:00", 22.0, 49.0, 640.0, 120.0)

    filename, text = history.export(session, "living_room", "all", "1h")

    assert filename == "wohnzimmer_alle-messgroessen_1h.csv"
    lines = text.lstrip("\ufeff").splitlines()
    assert lines[0] == "zeit,temperatur_°C,luftfeuchte_%,co2_ppm,verbrauch_W"
    assert len(lines) == 3

    first = lines[1].split(",")
    second = lines[2].split(",")
    assert first[0] == "2026-06-15T08:00:00"
    assert second[0] == "2026-06-15T08:10:00"
    assert len(first) == 5
    assert len(second) == 5
    assert float(first[1]) == pytest.approx(21.5)
    assert float(first[2]) == pytest.approx(48.0)
    assert float(first[3]) == pytest.approx(620.0)
    assert float(first[4]) == pytest.approx(100.0)
    assert float(second[1]) == pytest.approx(22.0)


def test_all_metric_export_keeps_a_shared_timestamp_grid(session: Session) -> None:
    _record_living_room(session, "2026-06-15T08:00:00", 21.5)
    _record_living_room(session, "2026-06-15T08:10:00", 22.0)

    _, text = history.export(session, "living_room", "all", "15m")

    lines = text.lstrip("\ufeff").splitlines()
    # Both timestamps of the window carry all four metrics in one row each.
    assert len(lines) == 3
    assert lines[1].startswith("2026-06-15T08:00:00,")
    assert lines[2].startswith("2026-06-15T08:10:00,")
    assert len(lines[1].split(",")) == 5
    assert len(lines[2].split(",")) == 5


def test_export_filename_names_room_metric_and_window(session: Session) -> None:
    _record_living_room(session, "2026-06-15T08:00:00", 21.5)

    filename, _ = history.export(session, "kitchen", "co2", "15m")

    assert filename == "kueche_co2_15m.csv"


def test_export_rejects_an_unknown_room(session: Session) -> None:
    with pytest.raises(ApiError) as excinfo:
        history.export(session, "attic", "temperature", "1h")

    assert excinfo.value.status_code == 400
    assert excinfo.value.code == "invalid_query"


def _seed_route_history() -> None:
    from app import db

    state = house.build_house(house.DEFAULT_SEED)
    state.sim_time = "2026-06-15T08:00:00"
    with db.session_scope() as db_session:
        history.record(db_session, state)


def test_export_route_downloads_a_csv_file(client: TestClient) -> None:
    _seed_route_history()

    response = client.get(
        "/api/history/export",
        params={"room_id": "living_room", "metric": "temperature", "window": "1h"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment")
    assert "wohnzimmer_temperatur_1h.csv" in disposition
    assert response.content.startswith(b"\xef\xbb\xbf")
    text = response.content.decode("utf-8-sig")
    assert text.splitlines()[0] == "zeit,temperatur_°C"


def test_export_route_supports_all_metrics(client: TestClient) -> None:
    _seed_route_history()

    response = client.get(
        "/api/history/export",
        params={"room_id": "living_room", "metric": "all", "window": "1h"},
    )

    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    assert "wohnzimmer_alle-messgroessen_1h.csv" in disposition
    header = response.content.decode("utf-8-sig").splitlines()[0]
    assert header == "zeit,temperatur_°C,luftfeuchte_%,co2_ppm,verbrauch_W"


@pytest.mark.parametrize(
    "params",
    [
        {"metric": "temperature", "window": "1h"},
        {"room_id": "attic", "metric": "temperature", "window": "1h"},
        {"room_id": "living_room", "metric": "pressure", "window": "1h"},
        {"room_id": "living_room", "metric": "all", "window": "2h"},
    ],
)
def test_export_route_answers_invalid_query(client: TestClient, params: dict) -> None:
    response = client.get("/api/history/export", params=params)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_query"
