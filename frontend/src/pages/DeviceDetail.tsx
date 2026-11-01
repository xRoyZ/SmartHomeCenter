/**
 * Device detail screen.
 *
 * Shows the live state of one device, its setpoint control, the measurement
 * series the device API returns for its room and the last action in plain
 * German. The setpoint and the device state are merged with the live house
 * snapshot, so a tick or a change from another browser appears without a
 * reload.
 */

import { useEffect, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import {
  DeviceControl,
  deviceLoadPercent,
  devicePowerText,
  deviceRoomTemperatureText,
  deviceStateWord,
  formatDecimal,
} from "../features/device/DeviceControl";
import { DeviceHistoryChart } from "../features/device/DeviceHistoryChart";
import { ApiError, getDevice, setDeviceState } from "../lib/api";
import { formatInteger, formatSimTime } from "../lib/format";
import { useLiveState } from "../lib/liveState";
import type {
  DeviceCommand,
  DeviceDetail as DeviceDetailData,
  DeviceState,
  HouseState,
  RoomState,
} from "../lib/types";
import { EmptyState, PageHead, View } from "../ui";

const GENERIC_ERROR = "Ein interner Fehler ist aufgetreten.";
const MISSING_DEVICE = "Das Gerät wurde nicht gefunden.";

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return GENERIC_ERROR;
}

function mergePending(device: DeviceState, pending: DeviceCommand): DeviceState {
  return {
    ...device,
    is_on: pending.is_on ?? device.is_on,
    level: pending.level ?? device.level,
    target_temp: pending.target_temp ?? device.target_temp,
  };
}

function findLiveDevice(state: HouseState | null, deviceId: string): DeviceState | null {
  if (!state) {
    return null;
  }
  for (const room of state.rooms) {
    const match = room.devices.find((device) => device.id === deviceId);
    if (match) {
      return match;
    }
  }
  return null;
}

function findRoom(state: HouseState | null, roomId: string | undefined): RoomState | null {
  if (!state || !roomId) {
    return null;
  }
  return state.rooms.find((room) => room.id === roomId) ?? null;
}

function primaryReading(device: DeviceState): { value: string; unit: string } {
  switch (device.type) {
    case "heating":
      return {
        value:
          device.target_temp === null ? "–" : formatDecimal(device.target_temp),
        unit: "°C Soll",
      };
    case "light":
      return { value: formatInteger(device.level ?? 0), unit: "% Helligkeit" };
    case "shutter":
      return { value: formatInteger(device.level ?? 0), unit: "% offen" };
    default:
      return { value: formatInteger(device.power_w), unit: "W" };
  }
}

function BackIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m12 19l-7-7l7-7m7 7H5"
      />
    </svg>
  );
}

function TrendIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M16 7h6v6" />
        <path d="m22 7l-8.5 8.5l-5-5L2 17" />
      </g>
    </svg>
  );
}

function ArrowRightIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14m-7-7l7 7l-7 7"
      />
    </svg>
  );
}

export function DeviceDetail(): ReactElement {
  const { deviceId = "" } = useParams<{ deviceId: string }>();
  const { state: liveState } = useLiveState();
  const [detail, setDetail] = useState<DeviceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState<DeviceCommand>({});
  const [commandError, setCommandError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setPending({});
    setCommandError(null);
    setFailure(null);
    setLoading(true);

    if (!deviceId) {
      setFailure(new ApiError("unknown_device", MISSING_DEVICE));
      setLoading(false);
      return () => {
        active = false;
      };
    }

    getDevice(deviceId)
      .then((loaded) => {
        if (active) {
          setDetail(loaded);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setFailure(error);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [deviceId]);

  const liveDevice = findLiveDevice(liveState, deviceId);
  const baseDevice = liveDevice ?? detail?.device ?? null;
  const device = baseDevice ? mergePending(baseDevice, pending) : null;

  useEffect(() => {
    if (!liveDevice) {
      return;
    }
    setPending((current) => {
      const next: DeviceCommand = { ...current };
      let changed = false;
      if (next.is_on !== undefined && next.is_on === liveDevice.is_on) {
        delete next.is_on;
        changed = true;
      }
      if (next.level !== undefined && next.level === liveDevice.level) {
        delete next.level;
        changed = true;
      }
      if (
        next.target_temp !== undefined &&
        next.target_temp === liveDevice.target_temp
      ) {
        delete next.target_temp;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [liveDevice]);

  const handleCommand = (command: DeviceCommand): void => {
    if (!detail) {
      return;
    }
    setCommandError(null);
    setPending((current) => ({ ...current, ...command }));

    void setDeviceState(detail.device.id, command)
      .then((updated) => {
        setDetail(updated);
      })
      .catch((error: unknown) => {
        setPending((current) => {
          const next: DeviceCommand = { ...current };
          for (const key of Object.keys(command) as (keyof DeviceCommand)[]) {
            delete next[key];
          }
          return next;
        });
        setCommandError(messageFor(error));
      });
  };

  if (loading) {
    return (
      <View>
        <PageHead
          title="Gerätedetail"
          description="Zustand, Verlauf und letzte Aktion eines Geräts."
        />
        <p className="page-note" role="status">
          Gerät wird geladen …
        </p>
      </View>
    );
  }

  if (!detail || !device) {
    const missing = failure instanceof ApiError && failure.code === "unknown_device";
    const roomPrefix = liveState?.rooms.find((room) =>
      deviceId.startsWith(`${room.id}_`),
    );
    const backTo = roomPrefix ? `/rooms/${encodeURIComponent(roomPrefix.id)}` : "/";
    const backLabel = roomPrefix ? roomPrefix.name : "Zur Hausübersicht";
    return (
      <View>
        <PageHead
          title={missing ? "Gerät nicht gefunden" : "Gerät nicht verfügbar"}
          description={
            missing
              ? "Zu diesem Gerät gehören keine Daten."
              : messageFor(failure)
          }
        />
        <EmptyState>
          {missing
            ? "Das Gerät wurde nicht gefunden. Vielleicht wurde es entfernt."
            : messageFor(failure)}
        </EmptyState>
        <Link className="btn-secondary" to={backTo}>
          <BackIcon />
          {backLabel}
        </Link>
      </View>
    );
  }

  const room = findRoom(liveState, device.room_id);
  const roomName = room?.name ?? detail.room_name;
  const roomTemperature = room?.sensors.temperature ?? null;
  const reading = primaryReading(device);
  const load = deviceLoadPercent(device);
  const lastAction = detail.last_action;
  const historyMetric = device.type === "heating" ? "temperature" : "power";
  const historyHref = `/history?room_id=${encodeURIComponent(device.room_id)}&metric=${historyMetric}`;

  return (
    <View>
      <section
        className="devblock"
        data-od-id="device-state"
        aria-label="Zustand des Geräts"
      >
        <span className="label">
          {`${device.name} ${roomName}`.trim()}
        </span>
        <div>
          <span className="state-word">{deviceStateWord(device)}</span>
        </div>
        <div className="bigfig" id="soll-fig">
          <span className="n">{reading.value}</span>
          <span className="u">{reading.unit}</span>
        </div>
        <div className="minis">
          <div>
            <b>{deviceRoomTemperatureText(roomTemperature)}</b>
            <small>Ist</small>
          </div>
          <div>
            <b>{`${formatInteger(load)} %`}</b>
            <small>Leistung</small>
          </div>
          <div>
            <b>{devicePowerText(device)}</b>
            <small>Verbrauch</small>
          </div>
        </div>
        <p className="delta" data-od-id="last-action">
          <TrendIcon />
          <span>
            {lastAction ? (
              <>
                <time dateTime={lastAction.sim_time}>
                  {formatSimTime(lastAction.sim_time)}
                </time>{" "}
                {lastAction.text}
              </>
            ) : (
              "Noch keine Bedienung aufgezeichnet."
            )}
          </span>
        </p>
      </section>

      <Link className="crumb" to={`/rooms/${encodeURIComponent(device.room_id)}`}>
        <BackIcon />
        {roomName}
      </Link>

      <div className="split">
        <DeviceControl
          device={device}
          roomName={roomName}
          roomTemperature={roomTemperature}
          onChange={handleCommand}
          error={commandError}
        />
        <DeviceHistoryChart
          device={device}
          roomName={roomName}
          series={detail.series}
        />
      </div>

      <Link className="btn-primary" to={historyHref} data-od-id="open-history">
        {device.type === "heating"
          ? "Heizung im Verlauf ansehen"
          : `${device.name} im Verlauf ansehen`}
        <ArrowRightIcon />
      </Link>
    </View>
  );
}
