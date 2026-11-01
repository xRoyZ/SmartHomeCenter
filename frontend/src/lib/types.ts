/**
 * Shared data contracts of the smart-home simulator.
 *
 * Every type mirrors `backend/app/schemas.py` one to one. The frontend owns no
 * second spelling of these structures: pages, the API client and the live state
 * provider all import from this module.
 */

export type Weather = "sunny" | "cloudy" | "rain" | "storm";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type OccupancyMode = "everyday" | "home" | "away";
export type SimSpeed = 1 | 10 | 60 | 300;
export type HistoryMetric = "temperature" | "humidity" | "co2" | "power";
export type HistoryWindow = "15m" | "1h" | "1d";
export type HistoryMetricSelection = HistoryMetric | "all";
export type MessageKind =
  | "room_cold"
  | "room_hot"
  | "co2_high"
  | "high_power"
  | "power_spike"
  | "smoke"
  | "water"
  | "automation";
export type MessageSeverity = "info" | "warning" | "critical";
export type MessageStatus = "open" | "acknowledged" | "all";
export type DeviceType = "heating" | "light" | "shutter" | "plug" | "appliance";
export type ThresholdKey =
  | "min_temperature"
  | "max_temperature"
  | "max_co2"
  | "max_power"
  | "power_spike_delta";
export type ConditionType =
  | "window_open"
  | "temperature_below"
  | "temperature_above"
  | "co2_above"
  | "time_after"
  | "time_before";
export type ActionType =
  | "heating_off"
  | "heating_set"
  | "light_on"
  | "light_off"
  | "shutter_close"
  | "shutter_set"
  | "plug_off";
export type EventType =
  | "forgotten_window"
  | "water_damage"
  | "power_spike"
  | "smoke_alarm"
  | "occupant_rush";
export type SimulationAction = "pause" | "resume";

export interface ErrorBody {
  code: string;
  message: string;
}

export interface OutdoorState {
  temperature: number;
  weather: Weather;
  season: Season;
  is_day: boolean;
  sunrise: string;
  sunset: string;
  solar_w: number;
}

export interface HouseTotals {
  power_w: number;
  solar_w: number;
  grid_w: number;
}

export interface DeviceState {
  id: string;
  room_id: string;
  name: string;
  type: DeviceType;
  is_on: boolean;
  level: number | null;
  target_temp: number | null;
  power_w: number;
  state_text: string;
}

export interface RoomSensors {
  temperature: number;
  humidity: number;
  co2: number;
  window_open: boolean;
  door_open: boolean;
  motion: boolean;
  smoke: boolean;
  water: boolean;
  power_w: number;
}

export interface RoomState {
  id: string;
  name: string;
  sensors: RoomSensors;
  devices: DeviceState[];
  heating_active: boolean;
  light_on: boolean;
  open_messages: number;
  status_text: string;
}

export interface HouseState {
  sim_time: string;
  weekday: string;
  tick: number;
  paused: boolean;
  speed: SimSpeed;
  seed: number;
  outdoor: OutdoorState;
  totals: HouseTotals;
  open_messages: number;
  rooms: RoomState[];
}

export interface DeviceCommand {
  is_on?: boolean;
  level?: number;
  target_temp?: number;
}

export interface HistoryPoint {
  t: string;
  value: number;
}

export interface HistorySeries {
  room_id: string;
  metric: HistoryMetric;
  window: string;
  unit: string;
  points: HistoryPoint[];
}

export interface LastAction {
  sim_time: string;
  text: string;
}

export interface RoomDetail {
  room: RoomState;
  devices: DeviceState[];
}

export interface DeviceDetail {
  device: DeviceState;
  room_name: string;
  series: HistorySeries[];
  last_action: LastAction | null;
}

export interface MessageOut {
  id: string;
  kind: MessageKind;
  severity: MessageSeverity;
  room_id: string | null;
  room_name: string | null;
  text: string;
  created_at: string;
  acknowledged_at: string | null;
}

export interface ConditionInput {
  type: ConditionType;
  room_id: string | null;
  value: number | null;
  time: string | null;
}

export interface ActionInput {
  type: ActionType;
  room_id: string;
  device_id: string | null;
  value: number | null;
}

export interface AutomationInput {
  name: string;
  enabled: boolean;
  condition: ConditionInput;
  action: ActionInput;
  notify: boolean;
}

export interface AutomationOut extends AutomationInput {
  id: string;
  created_at: string;
}

export interface ExecutionOut {
  id: string;
  automation_id: string;
  automation_name: string;
  sim_time: string;
  text: string;
}

export interface ThresholdOut {
  key: ThresholdKey;
  value: number;
  unit: string;
  default_value: number;
}

export interface ThresholdUpdate {
  value: number;
}

export interface SettingsOut {
  weather: Weather;
  season: Season;
  occupancy_mode: OccupancyMode;
  speed: number;
  seed: number;
  paused: boolean;
  sim_time: string;
  weekday: string;
}

export interface SettingsUpdate {
  weather?: Weather;
  season?: Season;
  occupancy_mode?: OccupancyMode;
  speed?: SimSpeed;
  seed?: number;
}

export interface SimulationControl {
  action: SimulationAction;
}

export interface ResetRequest {
  reset_automations: boolean;
  reset_thresholds: boolean;
}

export interface ResetResult {
  state: HouseState;
  settings: SettingsOut;
}

export interface EventRequest {
  room_id: string | null;
}

export interface EventResult {
  message: MessageOut;
  state: HouseState;
}

export interface HistoryQuery {
  room_id: string;
  metric: HistoryMetric;
  window: HistoryWindow;
}

export interface ExportQuery {
  room_id: string;
  metric: HistoryMetricSelection;
  window: HistoryWindow;
}
