/**
 * Typed client for the simulator's HTTP API.
 *
 * Every function maps to exactly one endpoint of the shared contract and throws
 * `ApiError` with the server's stable German code and message on failure.
 */

import type {
  AutomationInput,
  AutomationOut,
  DeviceCommand,
  DeviceDetail,
  EventResult,
  EventType,
  ExecutionOut,
  ExportQuery,
  HistoryQuery,
  HistorySeries,
  HouseState,
  MessageOut,
  MessageStatus,
  ResetRequest,
  ResetResult,
  RoomDetail,
  SettingsOut,
  SettingsUpdate,
  SimulationAction,
  ThresholdKey,
  ThresholdOut,
  ErrorBody,
} from "./types";

export const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);

const FALLBACK_MESSAGE = "Ein interner Fehler ist aufgetreten.";
const NETWORK_MESSAGE = "Die Verbindung zum Server ist fehlgeschlagen.";

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function errorFromPayload(payload: unknown): ApiError {
  if (payload && typeof payload === "object" && "error" in payload) {
    const body = (payload as { error?: Partial<ErrorBody> }).error;
    if (body && typeof body.code === "string" && typeof body.message === "string") {
      return new ApiError(body.code, body.message);
    }
  }
  return new ApiError("internal_error", FALLBACK_MESSAGE);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError("network_error", NETWORK_MESSAGE);
  }

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    throw errorFromPayload(payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function queryString(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return search.toString();
}

export function getState(): Promise<HouseState> {
  return request<HouseState>("/api/state");
}

export function getRoom(roomId: string): Promise<RoomDetail> {
  return request<RoomDetail>(`/api/rooms/${encodeURIComponent(roomId)}`);
}

export function getDevice(deviceId: string): Promise<DeviceDetail> {
  return request<DeviceDetail>(`/api/devices/${encodeURIComponent(deviceId)}`);
}

export function setDeviceState(deviceId: string, command: DeviceCommand): Promise<DeviceDetail> {
  return request<DeviceDetail>(
    `/api/devices/${encodeURIComponent(deviceId)}/state`,
    jsonBody("PUT", command),
  );
}

export function getHistory(query: HistoryQuery): Promise<HistorySeries> {
  return request<HistorySeries>(
    `/api/history?${queryString({
      room_id: query.room_id,
      metric: query.metric,
      window: query.window,
    })}`,
  );
}

export function exportHistoryUrl(query: ExportQuery): string {
  return `${API_BASE}/api/history/export?${queryString({
    room_id: query.room_id,
    metric: query.metric,
    window: query.window,
  })}`;
}

export function getMessages(status: MessageStatus = "open"): Promise<MessageOut[]> {
  return request<MessageOut[]>(`/api/messages?${queryString({ status })}`);
}

export function ackMessage(messageId: string): Promise<MessageOut> {
  return request<MessageOut>(`/api/messages/${encodeURIComponent(messageId)}/ack`, {
    method: "POST",
  });
}

export function getThresholds(): Promise<ThresholdOut[]> {
  return request<ThresholdOut[]>("/api/thresholds");
}

export function updateThreshold(key: ThresholdKey, value: number): Promise<ThresholdOut> {
  return request<ThresholdOut>(`/api/thresholds/${encodeURIComponent(key)}`, jsonBody("PUT", { value }));
}

export function getAutomations(): Promise<AutomationOut[]> {
  return request<AutomationOut[]>("/api/automations");
}

export function createAutomation(input: AutomationInput): Promise<AutomationOut> {
  return request<AutomationOut>("/api/automations", jsonBody("POST", input));
}

export function updateAutomation(
  automationId: string,
  input: AutomationInput,
): Promise<AutomationOut> {
  return request<AutomationOut>(
    `/api/automations/${encodeURIComponent(automationId)}`,
    jsonBody("PUT", input),
  );
}

export function deleteAutomation(automationId: string): Promise<void> {
  return request<void>(`/api/automations/${encodeURIComponent(automationId)}`, {
    method: "DELETE",
  });
}

export function getExecutions(automationId: string): Promise<ExecutionOut[]> {
  return request<ExecutionOut[]>(`/api/automations/${encodeURIComponent(automationId)}/executions`);
}

export function getSettings(): Promise<SettingsOut> {
  return request<SettingsOut>("/api/settings");
}

export function updateSettings(update: SettingsUpdate): Promise<SettingsOut> {
  return request<SettingsOut>("/api/settings", jsonBody("PUT", update));
}

export function controlSimulation(action: SimulationAction): Promise<SettingsOut> {
  return request<SettingsOut>("/api/simulation/control", jsonBody("POST", { action }));
}

export function resetSimulation(requestBody: ResetRequest): Promise<ResetResult> {
  return request<ResetResult>("/api/simulation/reset", jsonBody("POST", requestBody));
}

export function triggerEvent(
  eventType: EventType,
  roomId: string | null = null,
): Promise<EventResult> {
  return request<EventResult>(
    `/api/events/${encodeURIComponent(eventType)}`,
    jsonBody("POST", { room_id: roomId }),
  );
}

/** The live socket address derived from the configured API base. */
export function websocketUrl(): string {
  return `${API_BASE.replace(/^http/i, "ws")}/ws`;
}
