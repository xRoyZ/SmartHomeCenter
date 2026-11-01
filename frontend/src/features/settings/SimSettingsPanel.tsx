/**
 * `world` region of the settings screen.
 *
 * The panel shows the simulated world and forwards every change to the running
 * simulation. It holds no endpoint of its own: the page owns the API calls and
 * keeps the displayed settings in sync with the live house state.
 */

import { useEffect, useState, type ReactElement } from "react";

import type {
  OccupancyMode,
  Season,
  SettingsOut,
  SettingsUpdate,
  SimSpeed,
  Weather,
} from "../../lib/types";
import { Button, Field, Group } from "../../ui";
import { PauseIcon, PlayIcon } from "../../ui/PlaybackIcons";

interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  name: string;
  label: string;
  value: T | null;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

function Segmented<T extends string | number>({
  name,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedProps<T>): ReactElement {
  const labelId = `settings-label-${name}`;

  return (
    <div className="sgroup">
      <span className="label" id={labelId}>
        {label}
      </span>
      <div className="seg" data-name={name} role="group" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const WEATHER_OPTIONS: readonly SegmentedOption<Weather>[] = [
  { value: "sunny", label: "Sonnig" },
  { value: "cloudy", label: "Bewölkt" },
  { value: "rain", label: "Regen" },
  { value: "storm", label: "Gewitter" },
];

const SEASON_OPTIONS: readonly SegmentedOption<Season>[] = [
  { value: "spring", label: "Frühling" },
  { value: "summer", label: "Sommer" },
  { value: "autumn", label: "Herbst" },
  { value: "winter", label: "Winter" },
];

const OCCUPANCY_OPTIONS: readonly SegmentedOption<OccupancyMode>[] = [
  { value: "everyday", label: "Alltag" },
  { value: "home", label: "Jemand zu Hause" },
  { value: "away", label: "Abwesend" },
];

const SPEED_OPTIONS: readonly SegmentedOption<SimSpeed>[] = [
  { value: 1, label: "1×" },
  { value: 10, label: "10×" },
  { value: 60, label: "60×" },
  { value: 300, label: "300×" },
];

export interface SimSettingsPanelProps {
  settings: SettingsOut | null;
  paused: boolean;
  onUpdate: (update: SettingsUpdate) => void;
  onTogglePause: () => void;
}

export function SimSettingsPanel({
  settings,
  paused,
  onUpdate,
  onTogglePause,
}: SimSettingsPanelProps): ReactElement {
  const [seedDraft, setSeedDraft] = useState(settings ? String(settings.seed) : "");
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setSeedDraft(String(settings.seed));
    }
  }, [settings?.seed]);

  const disabled = settings === null;

  function applySeed(): void {
    const trimmed = seedDraft.trim();
    const value = Number(trimmed);
    if (!/^-?\d+$/.test(trimmed) || !Number.isSafeInteger(value)) {
      setSeedError("Der Seed muss eine ganze Zahl sein, zum Beispiel 4711.");
      return;
    }
    setSeedError(null);
    onUpdate({ seed: value });
  }

  return (
    <Group title="Welt" ariaLabel="Simulierte Welt" id="settings-world">
      <Segmented
        name="weather"
        label="Wetter"
        value={settings?.weather ?? null}
        options={WEATHER_OPTIONS}
        onChange={(weather) => onUpdate({ weather })}
        disabled={disabled}
      />
      <Segmented
        name="season"
        label="Jahreszeit"
        value={settings?.season ?? null}
        options={SEASON_OPTIONS}
        onChange={(season) => onUpdate({ season })}
        disabled={disabled}
      />
      <Segmented
        name="occupancy"
        label="Bewohner"
        value={settings?.occupancy_mode ?? null}
        options={OCCUPANCY_OPTIONS}
        onChange={(occupancy_mode) => onUpdate({ occupancy_mode })}
        disabled={disabled}
      />
      <Segmented
        name="speed"
        label="Geschwindigkeit"
        value={settings ? (settings.speed as SimSpeed) : null}
        options={SPEED_OPTIONS}
        onChange={(speed) => onUpdate({ speed })}
        disabled={disabled}
      />

      <div className="sgroup">
        <span className="label" id="settings-label-simulation">
          Simulation
        </span>
        <div
          role="group"
          aria-labelledby="settings-label-simulation"
          style={{ display: "flex", alignItems: "center", gap: "var(--s3)", flexWrap: "wrap" }}
        >
          <Button variant="secondary" onClick={onTogglePause} aria-pressed={paused}>
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? "Fortsetzen" : "Pause"}
          </Button>
          <span className="fieldhint" role="status">
            {paused ? "Die Simulation ist angehalten." : "Die Simulation läuft."}
          </span>
        </div>
      </div>

      <div className="sgroup">
        <div className="seedrow">
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field
              label="Seed"
              value={seedDraft}
              onChange={(value) => {
                setSeedDraft(value);
                if (seedError) {
                  setSeedError(null);
                }
              }}
              inputMode="numeric"
              error={seedError}
              hint="Eine ganze Zahl, zum Beispiel 4711."
              disabled={disabled}
            />
          </div>
          <Button onClick={applySeed} disabled={disabled}>
            Seed übernehmen
          </Button>
        </div>
      </div>
    </Group>
  );
}
