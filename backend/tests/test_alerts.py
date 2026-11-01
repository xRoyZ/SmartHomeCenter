"""Threshold alert evaluation (AC-09)."""

from __future__ import annotations

from app.schemas import HouseState, RoomState, ThresholdOut
from app.simulation import house
from app.simulation.alerts import evaluate

SIM_TIME = "2026-06-15T09:00:00"


def _state() -> HouseState:
    return house.build_house(house.DEFAULT_SEED)


def _room(state: HouseState, room_id: str) -> RoomState:
    return next(room for room in state.rooms if room.id == room_id)


def _thresholds(**overrides: float) -> list[ThresholdOut]:
    result: list[ThresholdOut] = []
    for threshold in house.default_thresholds():
        if threshold.key in overrides:
            threshold = threshold.model_copy(update={"value": overrides[threshold.key]})
        result.append(threshold)
    return result


def test_cold_room_message_names_room_time_and_severity() -> None:
    state = _state()
    _room(state, "living_room").sensors.temperature = 15.0

    messages = evaluate(state, house.default_thresholds(), SIM_TIME)

    cold = [message for message in messages if message.kind == "room_cold"]
    assert len(cold) == 1
    message = cold[0]
    assert message.room_id == "living_room"
    assert message.room_name == "Wohnzimmer"
    assert message.severity == "warning"
    assert message.created_at == SIM_TIME
    assert message.acknowledged_at is None
    assert "15,0" in message.text


def test_hot_room_is_reported() -> None:
    state = _state()
    _room(state, "kitchen").sensors.temperature = 30.0

    messages = evaluate(state, house.default_thresholds(), SIM_TIME)

    hot = [message for message in messages if message.kind == "room_hot"]
    assert len(hot) == 1
    assert hot[0].room_id == "kitchen"
    assert hot[0].severity == "warning"


def test_high_co2_is_reported() -> None:
    state = _state()
    _room(state, "kitchen").sensors.co2 = 1500.0

    messages = evaluate(state, house.default_thresholds(), SIM_TIME)

    co2 = [message for message in messages if message.kind == "co2_high"]
    assert len(co2) == 1
    assert co2[0].room_id == "kitchen"
    assert co2[0].severity == "warning"


def test_smoke_and_water_are_critical() -> None:
    state = _state()
    room = _room(state, "bathroom")
    room.sensors.smoke = True
    room.sensors.water = True

    messages = evaluate(state, house.default_thresholds(), SIM_TIME)

    kinds = {message.kind: message for message in messages}
    assert kinds["smoke"].severity == "critical"
    assert kinds["smoke"].room_id == "bathroom"
    assert kinds["water"].severity == "critical"
    assert kinds["water"].room_id == "bathroom"


def test_high_house_power_is_reported() -> None:
    state = _state()
    state.totals.power_w = 6000.0

    messages = evaluate(state, house.default_thresholds(), SIM_TIME)

    high_power = [message for message in messages if message.kind == "high_power"]
    assert len(high_power) == 1
    assert high_power[0].room_id is None
    assert high_power[0].severity == "warning"


def test_power_spike_compares_with_the_previous_tick() -> None:
    state = _state()
    thresholds = _thresholds(max_power=8000.0)

    assert [m for m in evaluate(state, thresholds, SIM_TIME) if m.kind == "power_spike"] == []

    state.totals.power_w += 2000.0
    messages = evaluate(state, thresholds, SIM_TIME)

    spikes = [message for message in messages if message.kind == "power_spike"]
    assert len(spikes) == 1
    assert spikes[0].severity == "critical"
    assert [m for m in evaluate(state, thresholds, SIM_TIME) if m.kind == "power_spike"] == []


def test_open_alert_is_not_duplicated_on_the_next_tick() -> None:
    state = _state()
    _room(state, "bedroom").sensors.temperature = 15.0

    first = evaluate(state, house.default_thresholds(), SIM_TIME)
    second = evaluate(state, house.default_thresholds(), SIM_TIME)

    assert [message for message in first if message.kind == "room_cold"]
    assert [message for message in second if message.kind == "room_cold"] == []


def test_alert_can_fire_again_after_the_condition_cleared() -> None:
    state = _state()
    room = _room(state, "bedroom")
    room.sensors.temperature = 15.0

    first = evaluate(state, house.default_thresholds(), SIM_TIME)
    assert [message for message in first if message.kind == "room_cold"]

    room.sensors.temperature = 21.0
    assert [
        m for m in evaluate(state, house.default_thresholds(), SIM_TIME) if m.kind == "room_cold"
    ] == []

    room.sensors.temperature = 15.0
    again = evaluate(state, house.default_thresholds(), SIM_TIME)
    repeated = [message for message in again if message.kind == "room_cold"]
    assert len(repeated) == 1
    assert repeated[0].id != first[0].id


def test_each_cold_room_gets_its_own_message() -> None:
    state = _state()
    _room(state, "bedroom").sensors.temperature = 15.0
    _room(state, "childrens_room").sensors.temperature = 16.0

    messages = evaluate(state, house.default_thresholds(), SIM_TIME)

    cold_rooms = {message.room_id for message in messages if message.kind == "room_cold"}
    assert cold_rooms == {"bedroom", "childrens_room"}


def test_changed_threshold_applies_on_the_next_crossing() -> None:
    state = _state()
    _room(state, "living_room").sensors.temperature = 19.0

    unchanged = evaluate(state, house.default_thresholds(), SIM_TIME)
    assert [message for message in unchanged if message.kind == "room_cold"] == []

    changed = evaluate(state, _thresholds(min_temperature=20.0), SIM_TIME)

    cold = [
        message
        for message in changed
        if message.kind == "room_cold" and message.room_id == "living_room"
    ]
    assert len(cold) == 1
    assert "20,0" in cold[0].text
    assert "19,0" in cold[0].text


def test_missing_thresholds_fall_back_to_the_factory_defaults() -> None:
    state = _state()
    _room(state, "living_room").sensors.temperature = 10.0

    messages = evaluate(state, [], SIM_TIME)

    assert [message for message in messages if message.kind == "room_cold"]
