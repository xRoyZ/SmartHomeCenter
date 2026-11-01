/**
 * Room detail screen.
 *
 * The room is read from the live house state, with `getRoom` as the initial
 * fallback for a deep link. Device commands go through `setDeviceState`; a
 * rejected command keeps the page live and shows the server's German message.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import { DeviceControlList } from "../features/room/DeviceControlList";
import { SensorGrid } from "../features/room/SensorGrid";
import { ApiError, getHistory, getRoom, setDeviceState } from "../lib/api";
import {
  formatNumber,
  formatSimTime,
  formatTemperature,
} from "../lib/format";
import { useLiveState } from "../lib/liveState";
import type {
  DeviceCommand,
  DeviceState,
  HistorySeries,
  RoomDetail as RoomDetailPayload,
} from "../lib/types";
import {
  Banner,
  ChartFrame,
  EmptyState,
  Group,
  PageHead,
  Split,
  View,
  type ChartLegendItem,
} from "../ui";

const GENERIC_ERROR = "Ein interner Fehler ist aufgetreten.";
const CHART_METRIC = "temperature";
const CHART_WINDOW = "1h";
const REFRESH_MS = 5000;
// The schedule-driven simulation can override a commanded device on the next
// tick (for example a light during the day). Keep the value the user just set
// visible for this long before the live snapshot takes over again.
const COMMAND_HOLD_MS = 1500;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return GENERIC_ERROR;
}

function applyCommand(device: DeviceState, command: DeviceCommand): DeviceState {
  return {
    ...device,
    is_on: command.is_on ?? device.is_on,
    level: command.level ?? device.level,
    target_temp: command.target_temp ?? device.target_temp,
  };
}

function axisLabelsFor(series: HistorySeries | null): string[] | undefined {
  if (!series || series.points.length < 2) {
    return undefined;
  }
  const points = series.points;
  const middle = points[Math.floor((points.length - 1) / 2)];
  return [
    formatSimTime(points[0].t),
    formatSimTime(middle.t),
    formatSimTime(points[points.length - 1].t),
  ];
}

function legendFor(series: HistorySeries | null, roomName: string): ChartLegendItem[] | undefined {
  if (!series || series.points.length < 2) {
    return undefined;
  }
  let lowest = series.points[0];
  for (const point of series.points) {
    if (point.value < lowest.value) {
      lowest = point;
    }
  }
  return [
    { label: `Temperatur ${roomName}` },
    { label: `${formatTemperature(lowest.value)} tiefster Wert ${formatSimTime(lowest.t)}` },
  ];
}

function ArrowIcon(): ReactElement {
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

export function RoomDetail(): ReactElement {
  const { roomId = "" } = useParams();
  const { state } = useLiveState();

  const [detail, setDetail] = useState<RoomDetailPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, DeviceCommand>>({});
  const pendingSince = useRef<Record<string, number>>({});
  const [series, setSeries] = useState<HistorySeries | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoadError(null);
    if (!roomId) {
      return undefined;
    }
    getRoom(roomId)
      .then((value) => {
        if (!cancelled) {
          setDetail(value);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(messageFor(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    if (!roomId) {
      return undefined;
    }

    const load = (initial: boolean) => {
      if (initial) {
        setSeries(null);
        setHistoryError(null);
        setHistoryLoading(true);
      }
      getHistory({ room_id: roomId, metric: CHART_METRIC, window: CHART_WINDOW })
        .then((value) => {
          if (!cancelled) {
            setSeries(value);
            setHistoryError(null);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setSeries(null);
            setHistoryError(messageFor(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setHistoryLoading(false);
          }
        });
    };

    // The simulated clock advances up to 300 times per real second, so the
    // series is refreshed on a real-time cadence rather than on every tick.
    load(true);
    const timer = window.setInterval(() => load(false), REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [roomId]);

  // A commanded value stays visible for a short window so the user sees the
  // control take effect; afterwards the live snapshot owns the shown state.
  useEffect(() => {
    if (!state) {
      return;
    }
    const now = Date.now();
    setPending((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }
      const next = { ...current };
      let removed = false;
      for (const liveRoomState of state.rooms) {
        for (const device of liveRoomState.devices) {
          const command = next[device.id];
          if (!command) {
            continue;
          }
          if (now - (pendingSince.current[device.id] ?? 0) < COMMAND_HOLD_MS) {
            continue;
          }
          delete next[device.id];
          delete pendingSince.current[device.id];
          removed = true;
        }
      }
      return removed ? next : current;
    });
  }, [state]);

  const liveRoom = state?.rooms.find((candidate) => candidate.id === roomId) ?? null;
  const room = liveRoom ?? detail?.room ?? null;

  const devices = useMemo(() => {
    const source = liveRoom?.devices ?? detail?.devices ?? [];
    return source.map((device) =>
      pending[device.id] ? applyCommand(device, pending[device.id]) : device,
    );
  }, [liveRoom, detail, pending]);

  async function handleCommand(device: DeviceState, command: DeviceCommand): Promise<void> {
    setActionError(null);
    pendingSince.current[device.id] = Date.now();
    setPending((current) => ({ ...current, [device.id]: command }));
    try {
      await setDeviceState(device.id, command);
    } catch (error) {
      delete pendingSince.current[device.id];
      setPending((current) => {
        const next = { ...current };
        delete next[device.id];
        return next;
      });
      setActionError(messageFor(error));
    }
  }

  if (!room) {
    return (
      <View>
        <PageHead
          crumb={{ to: "/", label: "Haus" }}
          title="Raumdetail"
          description="Sensorwerte und Geräte eines Raums."
        />
        {loadError ? <Banner tone="error">{loadError}</Banner> : null}
        {!loadError ? <EmptyState>Der Raum wird geladen …</EmptyState> : null}
      </View>
    );
  }

  const heating = devices.find((device) => device.type === "heating") ?? null;
  const points = series?.points.map((point) => point.value) ?? [];
  const axisLabels = axisLabelsFor(series);
  const legend = legendFor(series, room.name);
  const displayedError = actionError ?? loadError;

  return (
    <View>
      <PageHead
        crumb={{ to: "/", label: "Haus" }}
        variant="room"
        title={
          <>
            <span className="nm">{room.name}</span>
            <span className="bigfig">
              <span className="n">{formatNumber(room.sensors.temperature, 1)}</span>
              <span className="u">°C</span>
            </span>
          </>
        }
        description={
          <span className="sentence" style={{ color: "var(--ink)" }}>
            {room.status_text}
            {heating ? ` · ${heating.state_text}` : ""}
          </span>
        }
      />

      {displayedError ? <Banner tone="error">{displayedError}</Banner> : null}

      <Split>
        <SensorGrid sensors={room.sensors} />

        <DeviceControlList
          devices={devices}
          roomName={room.name}
          roomTemperature={room.sensors.temperature}
          onCommand={(device, command) => {
            void handleCommand(device, command);
          }}
        />

        <Group
          className="wide"
          title="Verlauf letzte Stunde · Temperatur"
          ariaLabel={`Temperaturverlauf im ${room.name} über die letzte Stunde`}
        >
          {historyError ? (
            <Banner tone="error">{historyError}</Banner>
          ) : (
            <ChartFrame
              points={points}
              ariaLabel={`Temperaturverlauf im ${room.name}: ${formatNumber(
                room.sensors.temperature,
                1,
              )} Grad Celsius`}
              axisLabels={axisLabels}
              legend={legend}
              right
              emptyText={
                historyLoading
                  ? "Der Verlauf wird geladen …"
                  : "Noch keine Messwerte für diesen Raum."
              }
            />
          )}
        </Group>
      </Split>

      {heating ? (
        <Link
          className="btn-primary"
          to={`/devices/${encodeURIComponent(heating.id)}`}
          data-od-id="open-device"
        >
          {heating.name} {room.name} öffnen
          <ArrowIcon />
        </Link>
      ) : null}
    </View>
  );
}
