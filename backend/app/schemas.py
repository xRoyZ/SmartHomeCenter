"""Shared data contracts for the smart-home simulator.

Every type named by the sprint contract lives here once. The frontend mirrors
these structures in ``src/lib/types.ts``.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Weather = Literal["sunny", "cloudy", "rain", "storm"]
Season = Literal["spring", "summer", "autumn", "winter"]
OccupancyMode = Literal["everyday", "home", "away"]
SimSpeed = Literal[1, 10, 60, 300]
HistoryMetric = Literal["temperature", "humidity", "co2", "power"]
HistoryWindow = Literal["15m", "1h", "1d"]
HistoryMetricSelection = Literal["temperature", "humidity", "co2", "power", "all"]
MessageKind = Literal[
    "room_cold",
    "room_hot",
    "co2_high",
    "high_power",
    "power_spike",
    "smoke",
    "water",
    "automation",
]
MessageSeverity = Literal["info", "warning", "critical"]
DeviceType = Literal["heating", "light", "shutter", "plug", "appliance"]
ThresholdKey = Literal[
    "min_temperature",
    "max_temperature",
    "max_co2",
    "max_power",
    "power_spike_delta",
]
ConditionType = Literal[
    "window_open",
    "temperature_below",
    "temperature_above",
    "co2_above",
    "time_after",
    "time_before",
]
ActionType = Literal[
    "heating_off",
    "heating_set",
    "light_on",
    "light_off",
    "shutter_close",
    "shutter_set",
    "plug_off",
]
EventType = Literal[
    "forgotten_window",
    "water_damage",
    "power_spike",
    "smoke_alarm",
    "occupant_rush",
]
TimeString = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class ErrorBody(BaseModel):
    """The inner part of the uniform error body."""

    code: str
    message: str


class ApiError(Exception):
    """An error the API answers with the contract's stable code and German text."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_body(code: str, message: str) -> dict[str, Any]:
    """Build the uniform error body ``{"error": {"code": ..., "message": ...}}``."""

    return {"error": {"code": code, "message": message}}


def error_detail(code: str, message: str) -> dict[str, str]:
    """Build the payload used inside a WebSocket ``error`` message."""

    return {"code": code, "message": message}


def not_implemented() -> ApiError:
    """Return the 501 error used by routes another ticket still owes."""

    return ApiError(501, "not_implemented", "Diese Funktion ist noch nicht verfügbar.")


class OutdoorState(BaseModel):
    temperature: float
    weather: Weather
    season: Season
    is_day: bool
    sunrise: str
    sunset: str
    solar_w: float


class HouseTotals(BaseModel):
    power_w: float
    solar_w: float
    grid_w: float


class DeviceState(BaseModel):
    id: str
    room_id: str
    name: str
    type: DeviceType
    is_on: bool
    level: int | None = None
    target_temp: float | None = None
    power_w: float
    state_text: str


class RoomSensors(BaseModel):
    temperature: float
    humidity: float
    co2: float
    window_open: bool
    door_open: bool
    motion: bool
    smoke: bool
    water: bool
    power_w: float


class RoomState(BaseModel):
    id: str
    name: str
    sensors: RoomSensors
    devices: list[DeviceState]
    heating_active: bool
    light_on: bool
    open_messages: int
    status_text: str


class HouseState(BaseModel):
    sim_time: str
    weekday: str
    tick: int
    paused: bool
    speed: SimSpeed
    outdoor: OutdoorState
    totals: HouseTotals
    open_messages: int
    rooms: list[RoomState]


class DeviceCommand(BaseModel):
    """A device command; only the fields the device type accepts are allowed."""

    model_config = ConfigDict(extra="forbid")

    is_on: bool | None = None
    level: int | None = Field(default=None, ge=0, le=100)
    target_temp: float | None = Field(default=None, ge=5.0, le=30.0)


class HistoryPoint(BaseModel):
    t: str
    value: float


class HistorySeries(BaseModel):
    room_id: str
    metric: HistoryMetric
    window: str
    unit: str
    points: list[HistoryPoint]


class LastAction(BaseModel):
    sim_time: str
    text: str


class RoomDetail(BaseModel):
    room: RoomState
    devices: list[DeviceState]


class DeviceDetail(BaseModel):
    device: DeviceState
    room_name: str
    series: list[HistorySeries]
    last_action: LastAction | None = None


class MessageOut(BaseModel):
    id: str
    kind: MessageKind
    severity: MessageSeverity
    room_id: str | None = None
    room_name: str | None = None
    text: str
    created_at: str
    acknowledged_at: str | None = None


class ConditionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: ConditionType
    room_id: str | None = None
    value: float | None = None
    time: TimeString | None = None


class ActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: ActionType
    room_id: str
    device_id: str | None = None
    value: float | None = None


class AutomationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    condition: ConditionInput
    action: ActionInput
    notify: bool = True


class AutomationOut(AutomationInput):
    id: str
    created_at: str


class ExecutionOut(BaseModel):
    id: str
    automation_id: str
    automation_name: str
    sim_time: str
    text: str


class ThresholdOut(BaseModel):
    key: ThresholdKey
    value: float
    unit: str
    default_value: float


class ThresholdUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: float


class SettingsOut(BaseModel):
    weather: Weather
    season: Season
    occupancy_mode: OccupancyMode
    speed: int
    seed: int
    paused: bool
    sim_time: str
    weekday: str


class SettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weather: Weather | None = None
    season: Season | None = None
    occupancy_mode: OccupancyMode | None = None
    speed: SimSpeed | None = None
    seed: int | None = None


class SimulationControl(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["pause", "resume"]


class ResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reset_automations: bool
    reset_thresholds: bool


class ResetResult(BaseModel):
    state: HouseState
    settings: SettingsOut


class EventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    room_id: str | None = None


class EventResult(BaseModel):
    message: MessageOut
    state: HouseState
