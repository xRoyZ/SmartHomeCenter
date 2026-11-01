/**
 * One room band of the house overview.
 *
 * The card carries the room's current figures and, in plain German, what is
 * going on there — so a cold room with an open window can be understood without
 * reading the numbers. Selecting the band opens the room detail route.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/cn";
import {
  formatCo2,
  formatHumidity,
  formatNumber,
  formatPowerWatts,
  formatTemperature,
} from "../../lib/format";
import type { RoomState } from "../../lib/types";

export interface RoomCardProps {
  room: RoomState;
  featured?: boolean;
  sparkValues?: readonly number[];
}

const ROOM_ANCHORS: Record<string, string> = {
  living_room: "wohnzimmer",
  kitchen: "kueche",
  bedroom: "schlafzimmer",
  childrens_room: "kinderzimmer",
  bathroom: "bad",
  hallway: "flur",
};

function AlertIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"
      />
    </svg>
  );
}

interface SparkPaths {
  line: string;
  area: string;
}

function sparkPaths(values: readonly number[]): SparkPaths | null {
  if (values.length < 2) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 300 / (values.length - 1);
  const points = values.map((value, index) => {
    const x = Math.round(index * step * 100) / 100;
    const y = Math.round((30 - ((value - min) / span) * 26) * 100) / 100;
    return `${x} ${y}`;
  });
  const line = `M${points.join(" L")}`;
  return { line, area: `${line} L300 32 L0 32 Z` };
}

function sparkTrend(values: readonly number[]): string {
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first + 0.1) {
    return "steigend";
  }
  if (last < first - 0.1) {
    return "fallend";
  }
  return "gleichbleibend";
}

function heatingPercent(room: RoomState): number {
  if (!room.heating_active) {
    return 0;
  }
  const heating = room.devices.find((device) => device.type === "heating");
  const level = heating?.level ?? 100;
  return Math.max(1, Math.min(100, Math.round(level)));
}

function lightLabel(room: RoomState): string {
  if (!room.light_on) {
    return "Licht aus";
  }
  const light = room.devices.find((device) => device.type === "light");
  const level = light?.level ?? null;
  if (level !== null && level < 100) {
    return `Licht ${level} %`;
  }
  return "Licht an";
}

export function RoomCard({ room, featured = false, sparkValues = [] }: RoomCardProps): ReactElement {
  const { sensors } = room;
  const percent = heatingPercent(room);
  const spark = featured ? sparkPaths(sparkValues) : null;
  const statusAlert = room.status_text !== "Alles normal";
  const tooCold = sensors.temperature < 19 && room.status_text !== "Zu kalt";
  const tooWarm = sensors.temperature > 26 && room.status_text !== "Zu warm";
  const statusParts = [room.status_text];
  if (tooCold) {
    statusParts.push("Zu kalt");
  }
  if (tooWarm) {
    statusParts.push("Zu warm");
  }
  const label = `${room.name}: ${formatTemperature(sensors.temperature)}, ${statusParts.join(
    ", ",
  )}. ${sensors.window_open ? "Fenster auf" : "Fenster zu"}, ${
    room.heating_active ? "Heizung heizt" : "Heizung aus"
  }.`;

  return (
    <Link
      to={`/rooms/${room.id}`}
      className={cn("room", featured && "raised")}
      data-od-id={`room-${ROOM_ANCHORS[room.id] ?? room.id}`}
      aria-label={label}
    >
      <span className="name">{room.name}</span>
      <span className="temp">
        <span>{formatNumber(sensors.temperature, 1)}</span>
        <small>°C</small>
        <span className="watt">{formatPowerWatts(sensors.power_w)}</span>
      </span>
      <span className="chips">
        <span className={cn("chip", sensors.window_open && "on")}>
          {sensors.window_open ? "Fenster auf" : "Fenster zu"}
        </span>
        <span className={cn("chip", room.heating_active && "heat-on")}>
          {room.heating_active ? `Heizt ${percent} %` : "Heizung aus"}
        </span>
        <span className={cn("chip", room.light_on && "on")}>{lightLabel(room)}</span>
        <span className={cn("chip", statusAlert && "alert")}>{room.status_text}</span>
        {tooCold ? <span className="chip alert">Zu kalt</span> : null}
        {tooWarm ? <span className="chip alert">Zu warm</span> : null}
        {sensors.co2 > 1000 ? (
          <span className="chip alert">
            <AlertIcon />
            {`CO₂ ${formatCo2(sensors.co2)}`}
          </span>
        ) : null}
        {sensors.humidity >= 70 ? (
          <span className="chip alert">
            <AlertIcon />
            {`Feuchte ${formatHumidity(sensors.humidity)}`}
          </span>
        ) : null}
      </span>
      {spark ? (
        <svg
          className="spark"
          viewBox="0 0 300 32"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Temperaturverlauf ${room.name}, simuliert, ${sparkTrend(sparkValues)}`}
        >
          <path className="fill" d={spark.area} />
          <path className="ln" d={spark.line} />
        </svg>
      ) : null}
      <span className="heat">
        <i style={{ width: "100%", transform: `scaleX(${percent / 100})` }} />
      </span>
    </Link>
  );
}
