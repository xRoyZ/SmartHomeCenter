"""Weather, day/night, season and solar simulation step."""

from __future__ import annotations

from datetime import datetime, timedelta
from random import Random

from app.schemas import HouseState
from app.simulation import house
from app.simulation.weather import season_daylight, step_weather


def _state(seed: int = 42) -> HouseState:
    return house.build_house(seed)


def _advance(state: HouseState, minutes: int, rng: Random) -> None:
    for _ in range(minutes):
        state.sim_time = (datetime.fromisoformat(state.sim_time) + timedelta(minutes=1)).isoformat(
            timespec="seconds"
        )
        step_weather(state, rng, 1)


def test_daytime_sets_is_day_and_solar_production() -> None:
    state = _state()
    state.sim_time = "2026-06-15T12:00:00"
    state.outdoor.season = "summer"

    step_weather(state, Random(1), 1)

    assert state.outdoor.is_day is True
    assert state.outdoor.solar_w > 0
    assert state.outdoor.sunrise == "05:30"
    assert state.outdoor.sunset == "21:30"


def test_night_produces_no_solar_power() -> None:
    state = _state()
    state.sim_time = "2026-06-15T23:00:00"
    state.outdoor.season = "summer"

    step_weather(state, Random(1), 1)

    assert state.outdoor.is_day is False
    assert state.outdoor.solar_w == 0.0


def test_season_changes_the_daylight_window() -> None:
    winter, summer = _state(), _state()
    winter.sim_time = "2026-06-15T17:00:00"
    summer.sim_time = "2026-06-15T17:00:00"
    winter.outdoor.season = "winter"
    summer.outdoor.season = "summer"

    step_weather(winter, Random(1), 1)
    step_weather(summer, Random(1), 1)

    assert (winter.outdoor.sunrise, winter.outdoor.sunset) == season_daylight("winter")
    assert winter.outdoor.is_day is False
    assert summer.outdoor.is_day is True


def test_weather_and_temperature_change_over_a_simulated_day() -> None:
    state = _state()
    state.sim_time = "2026-06-15T00:00:00"
    state.outdoor.season = "summer"
    rng = Random(42)
    weathers: set[str] = set()
    temperatures: list[float] = []

    for _ in range(24 * 60):
        state.sim_time = (datetime.fromisoformat(state.sim_time) + timedelta(minutes=1)).isoformat(
            timespec="seconds"
        )
        step_weather(state, rng, 1)
        weathers.add(state.outdoor.weather)
        temperatures.append(state.outdoor.temperature)

    assert len(weathers) >= 2
    assert max(temperatures) - min(temperatures) > 2.0
    assert all(-25.0 < value < 45.0 for value in temperatures)


def test_weather_step_is_deterministic_for_an_equal_seed() -> None:
    first, second = _state(), _state()
    first.sim_time = "2026-06-15T08:00:00"
    second.sim_time = "2026-06-15T08:00:00"

    _advance(first, 120, Random(5))
    _advance(second, 120, Random(5))

    assert first.outdoor.model_dump() == second.outdoor.model_dump()


def test_rain_produces_less_solar_power_than_sunshine() -> None:
    sunny, rainy = _state(), _state()
    sunny.sim_time = "2026-06-15T12:00:00"
    rainy.sim_time = "2026-06-15T12:00:00"
    sunny.outdoor.season = "summer"
    rainy.outdoor.season = "summer"
    sunny.outdoor.weather = "sunny"
    rainy.outdoor.weather = "rain"

    step_weather(sunny, Random(1), 1)
    step_weather(rainy, Random(1), 1)

    assert sunny.outdoor.solar_w > rainy.outdoor.solar_w


def test_temperature_converges_towards_the_weather_target() -> None:
    cold, warm = _state(), _state()
    cold.sim_time = "2026-06-15T03:00:00"
    warm.sim_time = "2026-06-15T15:00:00"
    cold.outdoor.season = "winter"
    warm.outdoor.season = "summer"
    cold.outdoor.temperature = 10.0
    warm.outdoor.temperature = 10.0

    for _ in range(120):
        cold.sim_time = (datetime.fromisoformat(cold.sim_time) + timedelta(minutes=1)).isoformat(
            timespec="seconds"
        )
        warm.sim_time = (datetime.fromisoformat(warm.sim_time) + timedelta(minutes=1)).isoformat(
            timespec="seconds"
        )
        step_weather(cold, Random(3), 1)
        step_weather(warm, Random(3), 1)

    assert warm.outdoor.temperature > cold.outdoor.temperature
