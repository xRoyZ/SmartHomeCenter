"""Physics step: window coupling, heating, solar yield and energy totals."""

from __future__ import annotations

from random import Random

import pytest

from app.schemas import DeviceState, HouseState, RoomState
from app.simulation.house import build_house
from app.simulation.physics import step_physics


def _room(state: HouseState, room_id: str) -> RoomState:
    return next(room for room in state.rooms if room.id == room_id)


def _device(room: RoomState, device_id: str) -> DeviceState:
    return next(device for device in room.devices if device.id == device_id)


def _run(state: HouseState, ticks: int, dt_min: int = 1) -> None:
    rng = Random(state.tick + 1)
    for _ in range(ticks):
        step_physics(state, rng, dt_min)
        state.tick += 1


def _no_solar_gain(state: HouseState) -> None:
    for room in state.rooms:
        for device in room.devices:
            if device.type == "shutter":
                device.level = 0


def test_open_window_cools_room_while_heating_warms_it() -> None:
    base = build_house(42)
    base.outdoor.temperature = 5.0
    base.outdoor.weather = "cloudy"
    _no_solar_gain(base)

    open_state = base.model_copy(deep=True)
    heated_state = base.model_copy(deep=True)

    open_room = _room(open_state, "living_room")
    open_room.sensors.window_open = True
    open_room.sensors.temperature = 21.0
    _device(open_room, "living_room_heating").is_on = False

    heated_room = _room(heated_state, "living_room")
    heated_room.sensors.window_open = False
    heated_room.sensors.temperature = 21.0
    heating = _device(heated_room, "living_room_heating")
    heating.is_on = True
    heating.target_temp = 24.0

    _run(open_state, 30)
    _run(heated_state, 30)

    assert _room(open_state, "living_room").sensors.temperature < 19.5
    assert _room(heated_state, "living_room").sensors.temperature > 21.5
    assert (
        _room(open_state, "living_room").sensors.temperature
        < _room(heated_state, "living_room").sensors.temperature
    )


def test_heating_raises_a_cold_room_and_reports_power() -> None:
    state = build_house(7)
    state.outdoor.temperature = 10.0
    _no_solar_gain(state)

    room = _room(state, "bedroom")
    room.sensors.temperature = 16.0
    room.sensors.window_open = False
    heating = _device(room, "bedroom_heating")
    heating.is_on = True
    heating.target_temp = 21.0

    _run(state, 20)

    room = _room(state, "bedroom")
    heating = _device(room, "bedroom_heating")
    assert room.sensors.temperature > 17.5
    assert room.heating_active is True
    assert heating.power_w > 0.0
    assert "heizt" in heating.state_text.lower()


def test_heating_stops_at_its_target() -> None:
    state = build_house(3)
    state.outdoor.temperature = 21.5
    _no_solar_gain(state)

    room = _room(state, "kitchen")
    room.sensors.temperature = 20.9
    heating = _device(room, "kitchen_heating")
    heating.is_on = True
    heating.target_temp = 21.0

    _run(state, 10)

    room = _room(state, "kitchen")
    heating = _device(room, "kitchen_heating")
    assert 20.9 <= room.sensors.temperature <= 21.2
    assert heating.power_w == 0.0
    assert room.heating_active is False


def test_holding_the_target_draws_only_what_the_losses_need() -> None:
    state = build_house(5)
    state.outdoor.temperature = 0.0
    state.outdoor.is_day = False
    state.outdoor.solar_w = 0.0

    room = _room(state, "bedroom")
    room.sensors.temperature = 21.0
    heating = _device(room, "bedroom_heating")
    heating.is_on = True
    heating.target_temp = 21.0

    _run(state, 30)

    room = _room(state, "bedroom")
    heating = _device(room, "bedroom_heating")
    assert room.sensors.temperature == pytest.approx(21.0, abs=0.05)
    assert 0.0 < heating.power_w < 700.0 / 2
    assert heating.level == round(heating.power_w / 700.0 * 100)


def test_a_heater_below_its_rate_reports_full_power_and_load() -> None:
    state = build_house(5)
    state.outdoor.temperature = 0.0
    room = _room(state, "bedroom")
    room.sensors.temperature = 15.0
    heating = _device(room, "bedroom_heating")
    heating.is_on = True
    heating.target_temp = 21.0

    _run(state, 1)

    heating = _device(_room(state, "bedroom"), "bedroom_heating")
    assert heating.power_w == 700.0
    assert heating.level == 100


def test_an_unheated_room_keeps_drifting_close_to_the_outdoor_temperature() -> None:
    state = build_house(5)
    state.outdoor.temperature = 19.0
    state.outdoor.is_day = False
    state.outdoor.solar_w = 0.0
    room = _room(state, "bedroom")
    room.sensors.temperature = 20.0
    room.sensors.humidity = 50.0
    room.sensors.motion = False
    for device in room.devices:
        device.is_on = False
        device.power_w = 0.0

    _run(state, 120)

    room = _room(state, "bedroom")
    # exp(-0.003 * 120) of the 1 K gap is left: about 19.70 °C.
    assert room.sensors.temperature == pytest.approx(19.70, abs=0.02)
    # exp(-0.02 * 120) of the 2 % gap to the 48 % baseline is left (about 48.2 %);
    # with one decimal the relaxation used to stop at 50.5 %.
    assert 48.1 < room.sensors.humidity < 48.3


def test_solar_yield_by_day_lowers_grid_draw() -> None:
    state = build_house(42)
    state.sim_time = "2026-06-15T12:00:00"
    state.outdoor.is_day = True
    state.outdoor.solar_w = 1800.0

    step_physics(state, Random(1), 1)

    assert state.outdoor.solar_w == 1800.0
    assert state.totals.solar_w == 1800.0
    assert state.totals.grid_w == round(state.totals.power_w - 1800.0, 1)
    assert state.totals.grid_w < state.totals.power_w


def test_solar_production_is_zero_at_night() -> None:
    state = build_house(42)
    state.sim_time = "2026-06-15T23:00:00"
    state.outdoor.is_day = False
    state.outdoor.solar_w = 1800.0

    step_physics(state, Random(1), 1)

    assert state.outdoor.solar_w == 0.0
    assert state.totals.solar_w == 0.0
    assert state.totals.grid_w == state.totals.power_w


def test_daytime_solar_is_produced_without_a_precomputed_value() -> None:
    state = build_house(42)
    state.sim_time = "2026-06-15T10:00:00"
    state.outdoor.is_day = True
    state.outdoor.solar_w = 0.0

    step_physics(state, Random(1), 1)

    assert state.outdoor.solar_w > 0.0
    assert state.totals.solar_w == state.outdoor.solar_w


def test_switched_devices_feed_room_and_house_power() -> None:
    state = build_house(42)
    room = _room(state, "living_room")
    light = _device(room, "living_room_light")
    light.is_on = True
    light.level = 100

    step_physics(state, Random(1), 1)

    room = _room(state, "living_room")
    light = _device(room, "living_room_light")
    assert light.power_w == 40.0
    assert room.sensors.power_w == round(sum(d.power_w for d in room.devices), 1)
    assert state.totals.power_w == round(sum(r.sensors.power_w for r in state.rooms), 1)


def test_cooking_and_showering_raise_humidity_and_co2() -> None:
    state = build_house(42)
    _no_solar_gain(state)
    kitchen = _room(state, "kitchen")
    bathroom = _room(state, "bathroom")
    coffee = _device(kitchen, "kitchen_coffee")
    coffee.is_on = True
    coffee.power_w = 900.0
    kitchen.sensors.motion = True
    bathroom.sensors.motion = True

    start_kitchen_humidity = kitchen.sensors.humidity
    start_kitchen_co2 = kitchen.sensors.co2
    start_bathroom_humidity = bathroom.sensors.humidity

    _run(state, 10)

    kitchen = _room(state, "kitchen")
    bathroom = _room(state, "bathroom")
    assert kitchen.sensors.humidity > start_kitchen_humidity
    assert kitchen.sensors.co2 > start_kitchen_co2
    assert bathroom.sensors.humidity > start_bathroom_humidity


def test_a_power_spike_ends_after_one_simulated_minute() -> None:
    from app.simulation import events

    state = build_house(42)
    events.apply(state, "power_spike", "kitchen", Random(1))
    spiked = next(d for d in _room(state, "kitchen").devices if d.power_w > 1500.0)
    assert spiked.id == "kitchen_fridge"

    step_physics(state, Random(1), 1)

    fridge = _device(_room(state, "kitchen"), "kitchen_fridge")
    assert fridge.power_w == 90.0
    assert "Stromspitze" not in fridge.state_text
