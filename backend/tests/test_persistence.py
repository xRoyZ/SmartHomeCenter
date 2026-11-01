"""Persistence round trip across a backend restart (AC-22)."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import get_session_factory, session_scope
from app.schemas import HouseState, SettingsOut
from app.simulation import house, persistence


def _modified_state() -> HouseState:
    state = house.build_house(house.DEFAULT_SEED)
    state.sim_time = "2026-06-15T17:20:00"
    state.weekday = "Dienstag"
    state.tick = 321
    state.paused = True
    state.speed = 60
    state.open_messages = 3
    state.rooms[0].sensors.temperature = 24.6
    state.rooms[0].sensors.window_open = True
    state.rooms[0].devices[1].is_on = True
    state.rooms[0].devices[1].power_w = 40.0
    return state


def _modified_settings(state: HouseState) -> SettingsOut:
    return house.initial_settings().model_copy(
        update={
            "speed": 60,
            "paused": True,
            "sim_time": state.sim_time,
            "weekday": state.weekday,
            "seed": 7,
            "weather": "rain",
            "season": "autumn",
            "occupancy_mode": "home",
        }
    )


def test_load_returns_none_when_nothing_was_saved(app: FastAPI) -> None:
    with TestClient(app), get_session_factory()() as session:
        assert persistence.load(session) is None


def test_save_and_load_round_trip(client: TestClient) -> None:
    state = _modified_state()
    settings = _modified_settings(state)

    with session_scope() as session:
        persistence.save(session, state, settings)

    with get_session_factory()() as session:
        restored = persistence.load(session)

    assert restored is not None
    restored_state, restored_settings = restored
    assert restored_state.sim_time == state.sim_time
    assert restored_state.tick == state.tick
    assert restored_state.paused is True
    assert restored_state.speed == 60
    assert restored_state.rooms[0].sensors.window_open is True
    assert abs(restored_state.rooms[0].sensors.temperature - 24.6) < 1e-6
    assert restored_state.rooms[0].devices[1].is_on is True
    assert restored_settings.seed == 7
    assert restored_settings.weather == "rain"
    assert restored_settings.season == "autumn"
    assert restored_settings.occupancy_mode == "home"
    assert restored_settings.speed == 60


def test_state_survives_a_restart(app: FastAPI) -> None:
    state = _modified_state()
    settings = _modified_settings(state)

    with TestClient(app), session_scope() as session:
        persistence.save(session, state, settings)

    with TestClient(app) as second:
        engine = second.app.state.engine
        assert engine.state.sim_time == state.sim_time
        assert engine.state.tick == state.tick
        assert engine.state.speed == 60
        assert engine.state.rooms[0].sensors.window_open is True
        assert engine.settings.seed == 7
        assert engine.settings.weather == "rain"
