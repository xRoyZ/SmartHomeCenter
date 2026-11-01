"""Behaviour step: occupancy modes drive motion, lights and appliances."""

from __future__ import annotations

from random import Random

import pytest

from app.schemas import DeviceState, HouseState, RoomState
from app.simulation import behavior
from app.simulation.house import build_house


@pytest.fixture(autouse=True)
def _everyday_mode() -> None:
    behavior.set_occupancy_mode("everyday")
    yield
    behavior.set_occupancy_mode("everyday")


def _room(state: HouseState, room_id: str) -> RoomState:
    return next(room for room in state.rooms if room.id == room_id)


def _device(room: RoomState, device_id: str) -> DeviceState:
    return next(device for device in room.devices if device.id == device_id)


def _at(state: HouseState, sim_time: str, is_day: bool) -> HouseState:
    state.sim_time = sim_time
    state.outdoor.is_day = is_day
    return state


def test_away_mode_leaves_the_house_still() -> None:
    state = _at(build_house(42), "2026-06-15T12:00:00", True)
    behavior.set_occupancy_mode("away")

    behavior.step_behavior(state, Random(1), 1)

    assert all(not room.sensors.motion for room in state.rooms)
    assert all(
        not device.is_on
        for room in state.rooms
        for device in room.devices
        if device.type == "light"
    )


def test_away_mode_switches_known_appliances_off() -> None:
    state = _at(build_house(42), "2026-06-15T12:00:00", True)
    behavior.set_occupancy_mode("away")

    behavior.step_behavior(state, Random(1), 1)

    appliance_ids = (
        "kitchen_coffee",
        "living_room_tv",
        "childrens_room_desk",
        "bedroom_bedside",
        "bathroom_washer",
    )
    for device_id in appliance_ids:
        room_id = device_id.rsplit("_", 1)[0]
        assert _device(_room(state, room_id), device_id).is_on is False
    fridge = _device(_room(state, "kitchen"), "kitchen_fridge")
    assert fridge.is_on is True


def test_everyday_morning_starts_coffee_and_bathroom_use() -> None:
    state = _at(build_house(42), "2026-06-15T07:00:00", True)

    behavior.step_behavior(state, Random(1), 1)

    kitchen = _room(state, "kitchen")
    bathroom = _room(state, "bathroom")
    coffee = _device(kitchen, "kitchen_coffee")
    assert coffee.is_on is True
    assert coffee.power_w == 900.0
    assert kitchen.sensors.motion is True
    assert bathroom.sensors.motion is True


def test_everyday_daytime_leaves_the_house_empty() -> None:
    state = _at(build_house(42), "2026-06-15T09:00:00", True)

    behavior.step_behavior(state, Random(1), 1)

    assert all(not room.sensors.motion for room in state.rooms)
    assert _device(_room(state, "kitchen"), "kitchen_coffee").is_on is False
    assert _device(_room(state, "living_room"), "living_room_tv").is_on is False


def test_everyday_evening_lights_and_entertainment_run() -> None:
    state = _at(build_house(42), "2026-06-15T18:30:00", False)

    behavior.step_behavior(state, Random(1), 1)

    living_room = _room(state, "living_room")
    tv = _device(living_room, "living_room_tv")
    light = _device(living_room, "living_room_light")
    assert living_room.sensors.motion is True
    assert tv.is_on is True
    assert light.is_on is True
    assert _device(_room(state, "childrens_room"), "childrens_room_desk").is_on is True


def test_home_mode_keeps_somebody_at_home_during_the_day() -> None:
    state = _at(build_house(42), "2026-06-15T12:30:00", True)
    behavior.set_occupancy_mode("home")

    behavior.step_behavior(state, Random(1), 1)

    assert any(room.sensors.motion for room in state.rooms)
    assert _device(_room(state, "living_room"), "living_room_tv").is_on is False
    assert _device(_room(state, "bathroom"), "bathroom_washer").is_on is True


def test_home_mode_draws_more_power_than_away_mode() -> None:
    away = _at(build_house(42), "2026-06-15T12:30:00", True)
    home = away.model_copy(deep=True)

    behavior.set_occupancy_mode("away")
    behavior.step_behavior(away, Random(1), 1)
    behavior.set_occupancy_mode("home")
    behavior.step_behavior(home, Random(1), 1)

    away_power = sum(device.power_w for room in away.rooms for device in room.devices)
    home_power = sum(device.power_w for room in home.rooms for device in room.devices)
    assert home_power > away_power


def test_state_attribute_overrides_the_module_mode() -> None:
    state = _at(build_house(42), "2026-06-15T12:30:00", True)
    object.__setattr__(state, "occupancy_mode", "away")
    behavior.set_occupancy_mode("home")

    behavior.step_behavior(state, Random(1), 1)

    assert all(not room.sensors.motion for room in state.rooms)


def test_a_manually_switched_device_keeps_its_state_between_schedule_changes() -> None:
    state = _at(build_house(42), "2026-06-15T10:00:00", True)
    behavior.step_behavior(state, Random(1), 1)
    living_room = _room(state, "living_room")
    light = _device(living_room, "living_room_light")
    tv = _device(living_room, "living_room_tv")
    light.is_on, light.level = True, 60
    tv.is_on = True

    state.sim_time = "2026-06-15T10:01:00"
    behavior.step_behavior(state, Random(1), 1)

    assert light.is_on and light.level == 60
    assert tv.is_on


def test_the_schedule_still_switches_when_its_plan_changes() -> None:
    state = _at(build_house(42), "2026-06-15T17:59:00", True)
    behavior.step_behavior(state, Random(1), 1)
    tv = _device(_room(state, "living_room"), "living_room_tv")
    assert not tv.is_on

    state.sim_time = "2026-06-15T18:00:00"
    behavior.step_behavior(state, Random(1), 1)

    assert tv.is_on


def test_a_changed_occupancy_mode_applies_on_the_next_step() -> None:
    state = _at(build_house(42), "2026-06-15T19:00:00", False)
    behavior.step_behavior(state, Random(1), 1)
    assert _device(_room(state, "living_room"), "living_room_tv").is_on

    behavior.set_occupancy_mode("away")
    state.sim_time = "2026-06-15T19:01:00"
    behavior.step_behavior(state, Random(1), 1)

    assert not _device(_room(state, "living_room"), "living_room_tv").is_on
    assert not _device(_room(state, "living_room"), "living_room_light").is_on


def test_an_occupant_entering_the_room_closes_a_forgotten_window() -> None:
    state = _at(build_house(42), "2026-06-15T15:58:00", True)
    behavior.step_behavior(state, Random(1), 1)
    living_room = _room(state, "living_room")
    living_room.sensors.window_open = True

    state.sim_time = "2026-06-15T15:59:00"
    behavior.step_behavior(state, Random(1), 1)
    assert living_room.sensors.window_open, "nobody is home yet"

    state.sim_time = "2026-06-15T16:00:00"
    behavior.step_behavior(state, Random(1), 1)
    assert not living_room.sensors.window_open


def test_a_light_left_on_in_an_empty_room_goes_off_at_sunrise() -> None:
    state = _at(build_house(42), "2026-06-16T05:28:00", False)
    behavior.step_behavior(state, Random(1), 1)
    hallway_light = _device(_room(state, "hallway"), "hallway_light")
    hallway_light.is_on, hallway_light.level, hallway_light.power_w = True, 100, 40.0

    _at(state, "2026-06-16T05:29:00", False)
    behavior.step_behavior(state, Random(1), 1)
    assert hallway_light.is_on, "still dark: the light stays as it was left"

    _at(state, "2026-06-16T05:30:00", True)
    behavior.step_behavior(state, Random(1), 1)
    assert not hallway_light.is_on
