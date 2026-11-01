/**
 * Filter region of the history screen.
 *
 * Offers the room, the metric and the simulated time window as selections.
 * The metric and window chips mirror the approved mockup; the room picker is
 * an addition required by the ticket and uses the kit's select field.
 */

import type { ReactElement } from "react";

import type { HistoryMetric, HistoryWindow, RoomState } from "../../lib/types";
import { Group, Select } from "../../ui";

export interface HistorySelection {
  roomId: string;
  metric: HistoryMetric;
  window: HistoryWindow;
}

export interface HistoryControlsProps {
  rooms: readonly Pick<RoomState, "id" | "name">[];
  selection: HistorySelection;
  onChange: (patch: Partial<HistorySelection>) => void;
}

interface WindowChoice {
  value: HistoryWindow;
  label: string;
}

interface MetricChoice {
  value: HistoryMetric;
  label: string;
}

const WINDOWS: readonly WindowChoice[] = [
  { value: "15m", label: "15 Minuten" },
  { value: "1h", label: "1 Stunde" },
  { value: "1d", label: "1 Tag" },
];

const METRICS: readonly MetricChoice[] = [
  { value: "temperature", label: "Temperatur" },
  { value: "humidity", label: "Luftfeuchte" },
  { value: "co2", label: "CO₂" },
  { value: "power", label: "Verbrauch" },
];

export function HistoryControls({
  rooms,
  selection,
  onChange,
}: HistoryControlsProps): ReactElement {
  const roomOptions = rooms.map((room) => ({ value: room.id, label: room.name }));

  return (
    <Group ariaLabel="Raum, Zeitfenster und Messgröße">
      <Select
        label="Raum"
        options={roomOptions}
        value={selection.roomId}
        disabled={roomOptions.length === 0}
        onChange={(roomId) => onChange({ roomId })}
      />
      {roomOptions.length === 0 ? (
        <p className="fieldhint">Die Räume werden geladen …</p>
      ) : null}
      <div className="filters" role="toolbar" aria-label="Zeitfenster und Messgröße">
        {WINDOWS.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className="fbtn"
            data-window={choice.value}
            aria-pressed={selection.window === choice.value}
            onClick={() => onChange({ window: choice.value })}
          >
            {choice.label}
          </button>
        ))}
        <span className="sep" aria-hidden="true" />
        {METRICS.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className="fbtn"
            data-metric={choice.value}
            aria-pressed={selection.metric === choice.value}
            onClick={() => onChange({ metric: choice.value })}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </Group>
  );
}
