"""Outdoor weather, season, day/night and solar simulation step.

The season is chosen in the settings, the daylight window follows from it and the
outside temperature follows a daily curve around a season base. Weather changes
randomly with a small probability per simulated minute, and the solar production
depends on daylight, weather and season.
"""

from __future__ import annotations

import math
from datetime import datetime
from random import Random

from ..schemas import HouseState

SEASON_DAYLIGHT: dict[str, tuple[str, str]] = {
    "spring": ("06:30", "20:00"),
    "summer": ("05:30", "21:30"),
    "autumn": ("07:00", "18:30"),
    "winter": ("08:00", "16:30"),
}

SEASON_CLIMATE: dict[str, tuple[float, float]] = {
    "spring": (13.0, 6.0),
    "summer": (22.0, 6.0),
    "autumn": (11.0, 5.0),
    "winter": (2.0, 4.0),
}

SEASON_SOLAR_FACTOR: dict[str, float] = {
    "spring": 0.85,
    "summer": 1.0,
    "autumn": 0.55,
    "winter": 0.35,
}

WEATHER_TEMPERATURE_OFFSET: dict[str, float] = {
    "sunny": 2.0,
    "cloudy": 0.0,
    "rain": -2.0,
    "storm": -3.0,
}

WEATHER_SOLAR_FACTOR: dict[str, float] = {
    "sunny": 1.0,
    "cloudy": 0.45,
    "rain": 0.15,
    "storm": 0.08,
}

WEATHER_CHOICES = ("sunny", "cloudy", "rain", "storm")
WEATHER_CHANGE_CHANCE = 0.02
MAX_TEMPERATURE_STEP = 0.35


def season_daylight(season: str) -> tuple[str, str]:
    """Return the sunrise and sunset of a season as ``HH:MM`` strings."""

    return SEASON_DAYLIGHT.get(season, SEASON_DAYLIGHT["summer"])


def _minutes_of_day(hhmm: str) -> int:
    hours, minutes = hhmm.split(":")
    return int(hours) * 60 + int(minutes)


def step_weather(state: HouseState, rng: Random, dt_min: int) -> None:
    """Advance weather, season and solar production by ``dt_min`` simulated minutes."""

    if dt_min <= 0:
        return

    moment = datetime.fromisoformat(state.sim_time)
    season = state.outdoor.season
    sunrise, sunset = season_daylight(season)
    state.outdoor.sunrise = sunrise
    state.outdoor.sunset = sunset

    day_minutes = moment.hour * 60 + moment.minute
    sunrise_minutes = _minutes_of_day(sunrise)
    sunset_minutes = _minutes_of_day(sunset)
    is_day = sunrise_minutes <= day_minutes < sunset_minutes
    state.outdoor.is_day = is_day

    if rng.random() < min(1.0, WEATHER_CHANGE_CHANCE * dt_min):
        candidates = [choice for choice in WEATHER_CHOICES if choice != state.outdoor.weather]
        state.outdoor.weather = rng.choice(candidates)

    base, amplitude = SEASON_CLIMATE.get(season, SEASON_CLIMATE["summer"])
    hour = moment.hour + moment.minute / 60.0
    daily = -math.cos(2.0 * math.pi * (hour - 5.0) / 24.0)
    target = base + amplitude * daily + WEATHER_TEMPERATURE_OFFSET[state.outdoor.weather]
    delta = (target - state.outdoor.temperature) * min(1.0, 0.2 * dt_min)
    delta = max(-MAX_TEMPERATURE_STEP * dt_min, min(MAX_TEMPERATURE_STEP * dt_min, delta))
    delta += rng.uniform(-0.1, 0.1) * dt_min
    state.outdoor.temperature = round(state.outdoor.temperature + delta, 1)

    solar_w = 0.0
    if is_day and sunset_minutes > sunrise_minutes:
        fraction = (day_minutes - sunrise_minutes) / (sunset_minutes - sunrise_minutes)
        clear_sky = 3000.0 * math.sin(math.pi * fraction)
        solar_w = (
            clear_sky
            * WEATHER_SOLAR_FACTOR[state.outdoor.weather]
            * SEASON_SOLAR_FACTOR.get(season, 1.0)
        )
        solar_w += rng.uniform(-20.0, 20.0)
    state.outdoor.solar_w = round(max(solar_w, 0.0), 1)
