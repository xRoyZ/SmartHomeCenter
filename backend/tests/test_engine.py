"""The simulation clock: advancing time, pause, speed, seed and publishing."""

from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import Callable
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, Reading
from app.schemas import SettingsUpdate
from app.simulation.engine import SimulationEngine


def _session_factory() -> Callable[[], Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, class_=Session, expire_on_commit=False)


def _build(seed: int = 42) -> tuple[SimulationEngine, list[dict]]:
    published: list[dict] = []

    async def publish(state) -> None:
        published.append(state.model_dump())

    return SimulationEngine(_session_factory(), publish), published


def _run(engine: SimulationEngine, ticks: int) -> None:
    async def runner() -> None:
        for _ in range(ticks):
            await engine.tick()

    asyncio.run(runner())


def test_construction_touches_no_database() -> None:
    # Startup must only build the in-memory house: the running lifespan restores
    # the persisted state, and a slow or locked store may not delay the API.
    def db_factory():
        raise AssertionError("construction must not open a database session")

    async def publish(state) -> None:
        return None

    engine = SimulationEngine(db_factory, publish)

    assert engine.state.sim_time == "2026-06-15T08:00:00"
    assert len(engine.state.rooms) == 6


def test_tick_advances_one_simulated_minute() -> None:
    engine, _ = _build()

    _run(engine, 1)

    assert engine.state.sim_time == "2026-06-15T08:01:00"
    assert engine.state.tick == 1
    assert engine.state.weekday == "Montag"

    _run(engine, 59)

    assert engine.state.sim_time == "2026-06-15T09:00:00"
    assert engine.state.tick == 60


def test_tick_publishes_a_snapshot() -> None:
    engine, published = _build()

    _run(engine, 3)

    assert len(published) == 3
    assert published[-1]["sim_time"] == engine.state.sim_time
    assert len(published[-1]["rooms"]) == 6


def test_paused_engine_does_not_advance() -> None:
    engine, published = _build()
    asyncio.run(engine.set_paused(True))
    before = engine.state.sim_time

    _run(engine, 5)

    assert engine.state.sim_time == before
    assert engine.state.tick == 0
    assert published  # pausing itself publishes the current snapshot


@pytest.mark.parametrize("speed", [1, 10, 60, 300])
def test_each_speed_step_changes_the_tick_interval(speed: int) -> None:
    engine, _ = _build()

    settings = asyncio.run(engine.set_settings(SettingsUpdate(speed=speed)))

    assert settings.speed == speed
    assert engine.state.speed == speed
    assert engine.tick_interval == pytest.approx(engine.tick_seconds / speed)
    assert engine.tick_interval <= engine.tick_seconds


def test_tick_still_advances_one_minute_at_high_speed() -> None:
    engine, _ = _build()
    asyncio.run(engine.set_settings(SettingsUpdate(speed=300)))
    before = datetime.fromisoformat(engine.state.sim_time)

    _run(engine, 1)

    after = datetime.fromisoformat(engine.state.sim_time)
    assert (after - before).total_seconds() == 60


def test_advance_steps_every_minute_and_publishes_once() -> None:
    engine, published = _build()
    single, _ = _build()

    asyncio.run(engine.advance(5))
    _run(single, 5)

    assert engine.state.tick == 5
    assert engine.state.sim_time == "2026-06-15T08:05:00"
    assert len(published) == 1
    assert engine.state.model_dump() == single.state.model_dump()
    with engine._db_factory() as session:
        times = session.scalars(
            select(Reading.sim_time).where(
                Reading.room_id == "living_room", Reading.metric == "temperature"
            )
        ).all()
    assert len(times) == 5


def test_the_clock_keeps_its_speed_when_ticks_take_time() -> None:
    # A tick that costs 10 ms used to stretch every 3.3 ms interval at 300x,
    # so the clock ran at about a quarter of its speed. The deadline clock
    # batches the minutes that are due instead.
    engine, _ = _build()
    engine.state.speed = 300
    minutes: list[int] = []

    async def slow_advance(count: int) -> None:
        minutes.append(count)
        await asyncio.sleep(0.010)

    engine.advance = slow_advance  # type: ignore[method-assign]

    async def runner() -> None:
        task = asyncio.create_task(engine._run_forever())
        await asyncio.sleep(1.0)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    asyncio.run(runner())

    expected = 1.0 / engine.tick_interval
    assert sum(minutes) >= 0.8 * expected


def test_the_first_tick_keeps_the_daylight_of_the_initial_house() -> None:
    engine, _ = _build()
    before = (engine.state.outdoor.sunrise, engine.state.outdoor.sunset)

    _run(engine, 1)

    assert (engine.state.outdoor.sunrise, engine.state.outdoor.sunset) == before


def test_equal_seed_produces_an_equal_sequence() -> None:
    first, _ = _build(seed=7)
    second, _ = _build(seed=7)

    _run(first, 30)
    _run(second, 30)

    assert first.state.model_dump() == second.state.model_dump()


def test_away_mode_turns_occupants_lights_and_appliances_off() -> None:
    engine, _ = _build()
    engine.state.sim_time = "2026-06-15T11:59:00"
    asyncio.run(engine.set_settings(SettingsUpdate(occupancy_mode="away")))

    _run(engine, 1)

    assert engine.settings.occupancy_mode == "away"
    for room in engine.state.rooms:
        assert room.sensors.motion is False
        assert room.light_on is False
        assert all(not device.is_on for device in room.devices if device.type == "light")
    scheduled = {device.id: device for room in engine.state.rooms for device in room.devices}
    assert scheduled["living_room_tv"].is_on is False
    assert scheduled["kitchen_coffee"].is_on is False


def test_home_mode_keeps_occupants_busy_at_midday() -> None:
    everyday, _ = _build()
    home, _ = _build()
    for engine in (everyday, home):
        engine.state.sim_time = "2026-06-15T11:59:00"

    _run(everyday, 1)
    asyncio.run(home.set_settings(SettingsUpdate(occupancy_mode="home")))
    _run(home, 1)

    assert all(not room.sensors.motion for room in everyday.state.rooms)
    assert any(room.sensors.motion for room in home.state.rooms)


def test_state_endpoint_returns_the_house(client: TestClient) -> None:
    response = client.get("/api/state")

    assert response.status_code == 200
    body = response.json()
    assert len(body["rooms"]) == 6
    assert body["sim_time"]
    assert body["totals"]["power_w"] >= 0


def test_clock_runs_and_pause_stops_it(client: TestClient) -> None:
    first = client.get("/api/state").json()
    time.sleep(1.4)
    second = client.get("/api/state").json()
    assert datetime.fromisoformat(second["sim_time"]) > datetime.fromisoformat(first["sim_time"])

    paused = client.post("/api/simulation/control", json={"action": "pause"})
    assert paused.status_code == 200
    assert paused.json()["paused"] is True
    frozen = client.get("/api/state").json()
    time.sleep(1.4)
    assert client.get("/api/state").json()["sim_time"] == frozen["sim_time"]

    assert client.post("/api/simulation/control", json={"action": "resume"}).status_code == 200
    time.sleep(1.4)
    resumed = client.get("/api/state").json()
    assert datetime.fromisoformat(resumed["sim_time"]) > datetime.fromisoformat(frozen["sim_time"])


def test_websocket_client_receives_every_simulated_minute(client: TestClient) -> None:
    with client.websocket_connect("/ws") as websocket:
        first = websocket.receive_json()
        second = websocket.receive_json()

    assert first["type"] == "snapshot"
    assert second["type"] == "snapshot"
    assert datetime.fromisoformat(second["payload"]["sim_time"]) > datetime.fromisoformat(
        first["payload"]["sim_time"]
    )
