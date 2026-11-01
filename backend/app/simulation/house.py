"""The demo house: six rooms, their devices, thresholds and automations.

Everything here is deterministic for a given seed, so a demonstration can be
repeated exactly.
"""

from __future__ import annotations

import math
import random
from datetime import datetime

from ..schemas import (
    AutomationInput,
    DeviceState,
    HouseState,
    HouseTotals,
    OutdoorState,
    RoomSensors,
    RoomState,
    SettingsOut,
    ThresholdOut,
)
from .weather import season_daylight

DEFAULT_SEED = 42
DEFAULT_START_TIME = "2026-06-15T08:00:00"
DEFAULT_WEEKDAY = "Montag"
# The factory house starts in summer, so it starts with the summer daylight the
# weather step keeps from the first tick on.
DEFAULT_SUNRISE, DEFAULT_SUNSET = season_daylight("summer")

ROOM_DEFINITIONS: tuple[tuple[str, str, float, float, float], ...] = (
    ("living_room", "Wohnzimmer", 21.5, 48.0, 620.0),
    ("kitchen", "Küche", 22.0, 52.0, 700.0),
    ("bedroom", "Schlafzimmer", 19.5, 46.0, 560.0),
    ("childrens_room", "Kinderzimmer", 19.0, 44.0, 520.0),
    ("bathroom", "Badezimmer", 21.0, 58.0, 480.0),
    ("hallway", "Flur", 20.0, 42.0, 460.0),
)


def _outdoor(sim_time: str, seed: int) -> OutdoorState:
    rng = random.Random(seed)
    moment = datetime.fromisoformat(sim_time)
    sunrise = datetime.fromisoformat(f"{moment.date().isoformat()}T{DEFAULT_SUNRISE}:00")
    sunset = datetime.fromisoformat(f"{moment.date().isoformat()}T{DEFAULT_SUNSET}:00")
    is_day = sunrise <= moment < sunset
    if is_day:
        day_fraction = (moment - sunrise).total_seconds() / (sunset - sunrise).total_seconds()
        solar_w = round(3000.0 * math.sin(math.pi * day_fraction), 1)
    else:
        solar_w = 0.0
    solar_w += round(rng.uniform(-40.0, 40.0), 1)
    return OutdoorState(
        temperature=round(22.0 + rng.uniform(-0.5, 0.5), 1),
        weather="sunny",
        season="summer",
        is_day=is_day,
        sunrise=DEFAULT_SUNRISE,
        sunset=DEFAULT_SUNSET,
        solar_w=max(solar_w, 0.0),
    )


def _heating(room_id: str, target_temp: float) -> DeviceState:
    active = target_temp > 20.0
    return DeviceState(
        id=f"{room_id}_heating",
        room_id=room_id,
        name="Heizung",
        type="heating",
        is_on=active,
        level=100 if active else 0,
        target_temp=target_temp,
        power_w=700.0 if active else 0.0,
        state_text="Heizung heizt" if active else "Heizung aus",
    )


def _light(room_id: str, is_on: bool = False) -> DeviceState:
    return DeviceState(
        id=f"{room_id}_light",
        room_id=room_id,
        name="Licht",
        type="light",
        is_on=is_on,
        level=100 if is_on else 0,
        power_w=40.0 if is_on else 0.0,
        state_text="Licht an" if is_on else "Licht aus",
    )


def _shutter(room_id: str, level: int = 100) -> DeviceState:
    return DeviceState(
        id=f"{room_id}_shutter",
        room_id=room_id,
        name="Rollladen",
        type="shutter",
        is_on=False,
        level=level,
        power_w=0.0,
        state_text=f"Rollladen {level} % offen",
    )


def _plug(room_id: str, slug: str, name: str, is_on: bool, power_w: float) -> DeviceState:
    return DeviceState(
        id=f"{room_id}_{slug}",
        room_id=room_id,
        name=name,
        type="plug",
        is_on=is_on,
        power_w=power_w if is_on else 0.0,
        state_text="Steckdose an" if is_on else "Steckdose aus",
    )


def _appliance(room_id: str, slug: str, name: str, is_on: bool, power_w: float) -> DeviceState:
    return DeviceState(
        id=f"{room_id}_{slug}",
        room_id=room_id,
        name=name,
        type="appliance",
        is_on=is_on,
        power_w=power_w if is_on else 0.0,
        state_text=f"{name} an" if is_on else f"{name} aus",
    )


def _devices_for(room_id: str) -> list[DeviceState]:
    devices = [
        _heating(room_id, 21.0),
        _light(room_id, is_on=room_id == "hallway"),
        _shutter(room_id),
    ]
    if room_id == "living_room":
        devices.append(_plug(room_id, "tv", "Steckdose Fernseher", False, 120.0))
    elif room_id == "kitchen":
        devices.append(_appliance(room_id, "fridge", "Kühlschrank", True, 90.0))
        devices.append(_plug(room_id, "coffee", "Steckdose Kaffeemaschine", False, 900.0))
    elif room_id == "bedroom":
        devices.append(_plug(room_id, "bedside", "Steckdose Nachttisch", False, 30.0))
    elif room_id == "childrens_room":
        devices.append(_plug(room_id, "desk", "Steckdose Schreibtisch", False, 60.0))
    elif room_id == "bathroom":
        devices.append(_appliance(room_id, "washer", "Waschmaschine", False, 1200.0))
    return devices


def _status_text(sensors: RoomSensors, heating_active: bool) -> str:
    if sensors.smoke:
        return "Rauchmelder ausgelöst"
    if sensors.water:
        return "Wasserschaden erkannt"
    if sensors.window_open and heating_active:
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


def build_house(seed: int) -> HouseState:
    """Build the full six-room house in its reproducible initial state."""

    rng = random.Random(seed)
    outdoor = _outdoor(DEFAULT_START_TIME, seed)
    rooms: list[RoomState] = []
    for room_id, name, base_temp, base_humidity, base_co2 in ROOM_DEFINITIONS:
        devices = _devices_for(room_id)
        power_w = round(sum(device.power_w for device in devices), 1)
        sensors = RoomSensors(
            temperature=round(base_temp + rng.uniform(-0.3, 0.3), 1),
            humidity=round(base_humidity + rng.uniform(-2.0, 2.0), 1),
            co2=round(base_co2 + rng.uniform(-30.0, 30.0), 1),
            window_open=False,
            door_open=False,
            motion=False,
            smoke=False,
            water=False,
            power_w=power_w,
        )
        heating = next(device for device in devices if device.type == "heating")
        heating_active = heating.is_on and (
            heating.target_temp is not None and heating.target_temp > sensors.temperature
        )
        light_on = any(device.type == "light" and device.is_on for device in devices)
        rooms.append(
            RoomState(
                id=room_id,
                name=name,
                sensors=sensors,
                devices=devices,
                heating_active=heating_active,
                light_on=light_on,
                open_messages=0,
                status_text=_status_text(sensors, heating_active),
            )
        )

    total_power = round(sum(room.sensors.power_w for room in rooms), 1)
    return HouseState(
        sim_time=DEFAULT_START_TIME,
        weekday=DEFAULT_WEEKDAY,
        tick=0,
        paused=False,
        speed=1,
        seed=seed,
        outdoor=outdoor,
        totals=HouseTotals(
            power_w=total_power,
            solar_w=outdoor.solar_w,
            grid_w=round(total_power - outdoor.solar_w, 1),
        ),
        open_messages=0,
        rooms=rooms,
    )


def default_thresholds() -> list[ThresholdOut]:
    """Return the factory thresholds of the demo house."""

    return [
        ThresholdOut(key="min_temperature", value=18.0, unit="°C", default_value=18.0),
        ThresholdOut(key="max_temperature", value=26.0, unit="°C", default_value=26.0),
        ThresholdOut(key="max_co2", value=1000.0, unit="ppm", default_value=1000.0),
        ThresholdOut(key="max_power", value=5000.0, unit="W", default_value=5000.0),
        ThresholdOut(key="power_spike_delta", value=1500.0, unit="W", default_value=1500.0),
    ]


def default_automations() -> list[AutomationInput]:
    """Return the factory automations of the demo house."""

    return [
        AutomationInput(
            name="Lüften stoppt Heizung",
            enabled=True,
            condition={"type": "window_open", "room_id": "living_room"},
            action={
                "type": "heating_off",
                "room_id": "living_room",
                "device_id": "living_room_heating",
            },
            notify=True,
        ),
        AutomationInput(
            name="Flurlicht am Abend",
            enabled=True,
            condition={"type": "time_after", "time": "18:00"},
            action={
                "type": "light_on",
                "room_id": "hallway",
                "device_id": "hallway_light",
            },
            notify=False,
        ),
        AutomationInput(
            name="Rollladen bei Hitze schließen",
            enabled=True,
            condition={"type": "temperature_above", "room_id": "kitchen", "value": 25.0},
            action={
                "type": "shutter_close",
                "room_id": "kitchen",
                "device_id": "kitchen_shutter",
            },
            notify=False,
        ),
    ]


def initial_settings() -> SettingsOut:
    """Return the factory settings of the demo house."""

    return SettingsOut(
        weather="sunny",
        season="summer",
        occupancy_mode="everyday",
        speed=1,
        seed=DEFAULT_SEED,
        paused=False,
        sim_time=DEFAULT_START_TIME,
        weekday=DEFAULT_WEEKDAY,
    )
