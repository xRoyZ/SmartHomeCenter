"""Indoor climate and energy physics.

The engine calls :func:`step_physics` once per simulated tick after weather and
occupant behaviour. It couples the building envelope to the outdoor climate,
translates heating and switched devices into temperature and electrical power,
turns cooking and showering into humidity and CO2 and derives the solar yield
that offsets the grid draw.

Only the engine's seeded ``rng`` is accepted as a randomness source; the
current equations are deterministic, so the argument is reserved for small
measurement effects that a later ticket may add.
"""

from __future__ import annotations

import math
from datetime import datetime, time
from random import Random

from ..schemas import DeviceState, HouseState, RoomState

HEATING_POWER_W = 700.0
HEATING_RATE_PER_MIN = 0.20
WALL_COUPLING_PER_MIN = 0.003
WINDOW_COUPLING_PER_MIN = 0.04
DOOR_COUPLING_PER_MIN = 0.02
SOLAR_HEAT_PER_MIN = 0.010
DEVICE_HEAT_PER_W_MIN = 6.0e-6

HUMIDITY_BASE = 48.0
CO2_BASE = 550.0
HUMIDITY_RELAX_PER_MIN = 0.02
CO2_RELAX_PER_MIN = 0.03
COOKING_HUMIDITY_PER_MIN = 0.20
COOKING_CO2_PER_MIN = 3.0
SHOWER_HUMIDITY_PER_MIN = 0.45
SHOWER_CO2_PER_MIN = 1.5
OCCUPANT_CO2_PER_MIN = 2.0

PEAK_SOLAR_W = 3000.0
WEATHER_SOLAR_FACTOR = {
    "sunny": 1.0,
    "cloudy": 0.45,
    "rain": 0.22,
    "storm": 0.08,
}
SEASON_SOLAR_FACTOR = {
    "spring": 0.85,
    "summer": 1.0,
    "autumn": 0.60,
    "winter": 0.35,
}

DEVICE_RATINGS_W = {
    "coffee": 900.0,
    "tv": 120.0,
    "washer": 1200.0,
    "desk": 60.0,
    "bedside": 30.0,
    "fridge": 90.0,
}


def _approach(value: float, target: float, rate_per_min: float, dt_min: int) -> float:
    """Exponentially relax ``value`` towards ``target`` over ``dt_min`` minutes."""

    factor = 1.0 - math.exp(-max(rate_per_min, 0.0) * max(dt_min, 0))
    return value + (target - value) * factor


def _day_fraction(sim_time: str, sunrise: str, sunset: str) -> float | None:
    """Return how far the simulated day has progressed between sunrise and sunset."""

    try:
        moment = datetime.fromisoformat(sim_time)
        rise = datetime.combine(moment.date(), time.fromisoformat(sunrise))
        setting = datetime.combine(moment.date(), time.fromisoformat(sunset))
    except (TypeError, ValueError):
        return None
    span = (setting - rise).total_seconds()
    if span <= 0:
        return None
    return max(0.0, min(1.0, (moment - rise).total_seconds() / span))


def _weather_solar(house: HouseState) -> float:
    """Compute the solar yield from weather, season and the time of day."""

    if not house.outdoor.is_day:
        return 0.0

    weather = WEATHER_SOLAR_FACTOR.get(house.outdoor.weather, 0.5)
    season = SEASON_SOLAR_FACTOR.get(house.outdoor.season, 0.7)
    fraction = _day_fraction(house.sim_time, house.outdoor.sunrise, house.outdoor.sunset)
    if fraction is None:
        return round(PEAK_SOLAR_W * weather * season * 0.5, 1)
    return round(PEAK_SOLAR_W * math.sin(math.pi * fraction) * weather * season, 1)


def _solar_yield(house: HouseState) -> float:
    """Return the produced solar power; production is zero at night."""

    if not house.outdoor.is_day:
        return 0.0
    if house.outdoor.solar_w > 0.0:
        return round(house.outdoor.solar_w, 1)
    return _weather_solar(house)


def _rated_power(device: DeviceState) -> float:
    """Return the rated power of a plug or appliance when it was not reported."""

    for suffix, watts in DEVICE_RATINGS_W.items():
        if device.id.endswith(f"_{suffix}"):
            return watts
    return 600.0 if device.type == "appliance" else 100.0


def _heating_device(room: RoomState) -> DeviceState | None:
    return next((device for device in room.devices if device.type == "heating"), None)


def _step_heating(room: RoomState, dt_min: int) -> None:
    """Move a running heater towards its target and report its power output.

    The heater modulates: it delivers only the heat the room needs to reach
    the target in this step, up to its full rate, and its electrical power and
    load (``level`` in percent) follow that share of the full output. Holding
    a room at its target therefore draws what the losses demand, not the
    heater's full power.
    """

    heating = _heating_device(room)
    if heating is None:
        room.heating_active = False
        return

    target = heating.target_temp
    full_step = HEATING_RATE_PER_MIN * max(dt_min, 0)
    if heating.is_on and target is not None and room.sensors.temperature < target and full_step:
        added = min(target - room.sensors.temperature, full_step)
        room.sensors.temperature += added
        share = added / full_step
        heating.power_w = round(HEATING_POWER_W * share, 1)
        heating.level = max(1, round(share * 100))
        heating.state_text = "Heizung heizt"
        room.heating_active = True
        return

    heating.power_w = 0.0
    heating.level = 0
    heating.state_text = "Heizung aus"
    room.heating_active = False


def _shutter_open_fraction(room: RoomState) -> float:
    levels = [device.level for device in room.devices if device.type == "shutter"]
    if not levels:
        return 0.0
    level = max(level if level is not None else 100 for level in levels)
    return max(0.0, min(1.0, level / 100.0))


def _cooking_active(room: RoomState) -> bool:
    """Return whether a cooking appliance (not the always-on fridge) runs."""

    if room.id != "kitchen":
        return False
    return any(
        device.type in {"plug", "appliance"} and device.is_on and not device.id.endswith("_fridge")
        for device in room.devices
    )


def _step_air(room: RoomState, dt_min: int) -> None:
    """Relax humidity and CO2 towards their baseline and add occupant sources."""

    sensors = room.sensors
    sensors.humidity = _approach(sensors.humidity, HUMIDITY_BASE, HUMIDITY_RELAX_PER_MIN, dt_min)
    sensors.co2 = _approach(sensors.co2, CO2_BASE, CO2_RELAX_PER_MIN, dt_min)

    if _cooking_active(room):
        sensors.humidity += COOKING_HUMIDITY_PER_MIN * dt_min
        sensors.co2 += COOKING_CO2_PER_MIN * dt_min

    showering = room.id == "bathroom" and sensors.motion
    if showering:
        sensors.humidity += SHOWER_HUMIDITY_PER_MIN * dt_min
        sensors.co2 += SHOWER_CO2_PER_MIN * dt_min

    if sensors.motion:
        sensors.co2 += OCCUPANT_CO2_PER_MIN * dt_min

    sensors.humidity = round(max(20.0, min(95.0, sensors.humidity)), 2)
    sensors.co2 = round(max(350.0, min(3000.0, sensors.co2)), 1)


def _step_device_power(device: DeviceState) -> None:
    """Recalculate the electrical power a switched device currently draws."""

    if device.type == "heating":
        return
    if device.type == "light":
        level = device.level if device.level is not None else 100
        device.power_w = round(40.0 * max(0, min(100, level)) / 100.0, 1) if device.is_on else 0.0
        device.state_text = "Licht an" if device.is_on else "Licht aus"
        return
    if device.type == "shutter":
        level = device.level if device.level is not None else 100
        device.power_w = 0.0
        device.state_text = f"Rollladen {level} % offen"
        return

    if device.is_on:
        # A running plug or appliance draws its rated power; an extra load put
        # on top of it (the power-spike event) lasts one simulated minute.
        device.power_w = _rated_power(device)
        device.state_text = f"{device.name} an" if device.type == "appliance" else "Steckdose an"
    else:
        device.power_w = 0.0
        device.state_text = f"{device.name} aus" if device.type == "appliance" else "Steckdose aus"


def _status_text(room: RoomState) -> str:
    sensors = room.sensors
    if sensors.smoke:
        return "Rauchmelder ausgelöst"
    if sensors.water:
        return "Wasserschaden erkannt"
    if sensors.window_open and room.heating_active:
        return "Fenster offen, Heizung läuft"
    if sensors.window_open:
        return "Fenster offen"
    if sensors.temperature < 19.0:
        return "Zu kalt"
    if sensors.temperature > 26.0:
        return "Zu warm"
    if sensors.co2 > 1000.0:
        return "Luftqualität schlecht"
    return "Alles normal"


def _step_room(room: RoomState, house: HouseState, solar_w: float, dt_min: int) -> None:
    sensors = room.sensors
    outdoor = house.outdoor

    coupling = WALL_COUPLING_PER_MIN
    if sensors.window_open:
        coupling += WINDOW_COUPLING_PER_MIN
    if sensors.door_open:
        coupling += DOOR_COUPLING_PER_MIN
    sensors.temperature = _approach(sensors.temperature, outdoor.temperature, coupling, dt_min)

    _step_heating(room, dt_min)

    if outdoor.is_day and solar_w > 0.0:
        gain = (
            SOLAR_HEAT_PER_MIN
            * min(1.5, solar_w / PEAK_SOLAR_W)
            * _shutter_open_fraction(room)
            * dt_min
        )
        sensors.temperature += gain

    internal_power = sum(device.power_w for device in room.devices if device.type != "heating")
    sensors.temperature += internal_power * DEVICE_HEAT_PER_W_MIN * dt_min
    # Three decimals: a step of the slow wall coupling (0.003 per minute) stays
    # visible close to the outdoor temperature instead of rounding to zero.
    sensors.temperature = round(max(-20.0, min(45.0, sensors.temperature)), 3)

    _step_air(room, dt_min)

    for device in room.devices:
        _step_device_power(device)

    sensors.power_w = round(sum(device.power_w for device in room.devices), 1)
    room.light_on = any(device.type == "light" and device.is_on for device in room.devices)
    room.status_text = _status_text(room)


def step_physics(state: HouseState, rng: Random, dt_min: int) -> None:
    """Advance room climate, heating and energy by ``dt_min`` simulated minutes."""

    del rng  # The current physics is deterministic; the engine still owns the seed.

    solar_w = _solar_yield(state)
    state.outdoor.solar_w = solar_w

    for room in state.rooms:
        _step_room(room, state, solar_w, max(0, dt_min))

    total_power = round(sum(room.sensors.power_w for room in state.rooms), 1)
    state.totals.power_w = total_power
    state.totals.solar_w = solar_w
    state.totals.grid_w = round(total_power - solar_w, 1)
