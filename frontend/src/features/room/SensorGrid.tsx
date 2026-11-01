/**
 * Sensor ledger of one room.
 *
 * The temperature itself sits in the room head; this list carries every other
 * simulated reading the room exposes, including the two alarm sensors, so the
 * screen never hides a value the simulation tracks.
 */

import type { ReactElement, ReactNode } from "react";

import { cn } from "../../lib/cn";
import { formatInteger } from "../../lib/format";
import type { RoomSensors } from "../../lib/types";
import { Group } from "../../ui";

export interface SensorGridProps {
  sensors: RoomSensors;
}

interface SensorRow {
  key: string;
  label: string;
  value: ReactNode;
  word?: boolean;
}

function yesNo(value: boolean): string {
  return value ? "ja" : "nein";
}

function openClosed(value: boolean): string {
  return value ? "offen" : "zu";
}

export function SensorGrid({ sensors }: SensorGridProps): ReactElement {
  const rows: SensorRow[] = [
    {
      key: "humidity",
      label: "Luftfeuchte",
      value: (
        <>
          {formatInteger(sensors.humidity)}
          <small>%</small>
        </>
      ),
    },
    {
      key: "co2",
      label: "CO₂",
      value: (
        <>
          {formatInteger(sensors.co2)}
          <small>ppm</small>
        </>
      ),
    },
    { key: "window", label: "Fenster", value: openClosed(sensors.window_open), word: true },
    { key: "door", label: "Tür", value: openClosed(sensors.door_open), word: true },
    { key: "motion", label: "Bewegung", value: yesNo(sensors.motion), word: true },
    { key: "smoke", label: "Rauch", value: yesNo(sensors.smoke), word: true },
    { key: "water", label: "Wasser", value: yesNo(sensors.water), word: true },
    {
      key: "power",
      label: "Verbrauch",
      value: (
        <>
          {formatInteger(sensors.power_w)}
          <small>W</small>
        </>
      ),
    },
  ];

  return (
    <Group title="Sensoren · simuliert" ariaLabel="Sensorwerte">
      <ul className="ledger">
        {rows.map((row) => (
          <li key={row.key}>
            <span className="k">{row.label}</span>
            <span className={cn("v", row.word && "word")}>{row.value}</span>
          </li>
        ))}
      </ul>
    </Group>
  );
}
