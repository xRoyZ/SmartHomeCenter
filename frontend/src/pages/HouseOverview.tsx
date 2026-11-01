/**
 * House overview — the start page of the simulator.
 *
 * The screen is a live section cut through the house: the simulation controls
 * and the weather sit in the dark sky band, the net draw and the six room bands
 * below it, and a short jump list leads to the neighbouring screens. All
 * figures come from the shared live state, so a change made in another browser
 * arrives here without a reload.
 */

import { useEffect, useState, type ReactElement } from "react";

import { HouseTotals } from "../features/overview/HouseTotals";
import { RoomCard } from "../features/overview/RoomCard";
import { ApiError, controlSimulation, updateSettings } from "../lib/api";
import { formatTemperature } from "../lib/format";
import { useLiveState } from "../lib/liveState";
import type { SimSpeed, Season, Weather } from "../lib/types";
import { Banner, Button, EmptyState, JumpLinks, type JumpLinkItem } from "../ui";
import "../features/overview/overview.css";

const SPEEDS: readonly SimSpeed[] = [1, 10, 60, 300];
const SPARK_POINTS = 40;
const FALLBACK_ERROR = "Die Änderung konnte nicht gespeichert werden.";

const WEATHER_LABELS: Record<Weather, string> = {
  sunny: "Sonnig",
  cloudy: "Bewölkt",
  rain: "Regen",
  storm: "Gewitter",
};

const SEASON_LABELS: Record<Season, string> = {
  spring: "Frühling",
  summer: "Sommer",
  autumn: "Herbst",
  winter: "Winter",
};

const JUMP_LINKS: readonly JumpLinkItem[] = [
  {
    to: "/devices/living_room_heating",
    label: "Heizung Wohnzimmer",
    hint: "Gerätedetail",
  },
  { to: "/thresholds", label: "Schwellwerte", hint: "Grenzen der Meldungen" },
  { to: "/settings", label: "Einstellungen", hint: "Wetter, Seed, Ereignisse" },
];

function formatClock(value: string): string {
  const match = /(\d{1,2}):(\d{2})/.exec(value);
  if (!match) {
    return value;
  }
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function PauseIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <rect width="5" height="18" x="14" y="3" rx="1" />
        <rect width="5" height="18" x="5" y="3" rx="1" />
      </g>
    </svg>
  );
}

function PlayIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m6 3l14 9l-14 9z"
      />
    </svg>
  );
}

function SunriseIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 2v8m-7.07.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M8 6l4-4l4 4m0 12a4 4 0 0 0-8 0"
      />
    </svg>
  );
}

function SunsetIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 10V2m-7.07 8.93l1.41 1.41M2 18h2m16 0h2m-2.93-7.07l-1.41 1.41M22 22H2M16 6l-4 4l-4-4m8 12a4 4 0 0 0-8 0"
      />
    </svg>
  );
}

function WeatherIcon({ weather }: { weather: Weather }): ReactElement {
  switch (weather) {
    case "sunny":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
          </g>
        </svg>
      );
    case "rain":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9" />
            <path d="M8 17v3m4-3v3m4-3v3" />
          </g>
        </svg>
      );
    case "storm":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9" />
            <path d="m13 16l-3 5h4l-2 3" />
          </g>
        </svg>
      );
    case "cloudy":
    default:
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9"
          />
        </svg>
      );
  }
}

export function HouseOverview(): ReactElement {
  const { state } = useLiveState();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [spark, setSpark] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!state) {
      return;
    }
    setSpark((current) => {
      let changed = false;
      const next: Record<string, number[]> = { ...current };
      for (const room of state.rooms) {
        const previous = next[room.id] ?? [];
        const value = room.sensors.temperature;
        if (previous.length === 0 || previous[previous.length - 1] !== value) {
          next[room.id] = [...previous, value].slice(-SPARK_POINTS);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [state]);

  const run = async (operation: () => Promise<unknown>): Promise<void> => {
    setPending(true);
    try {
      await operation();
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : FALLBACK_ERROR);
    } finally {
      setPending(false);
    }
  };

  if (!state) {
    return (
      <div className="page">
        <h1 className="sr-only">Hausübersicht</h1>
        <EmptyState>Die Hausübersicht wird geladen …</EmptyState>
      </div>
    );
  }

  const { outdoor } = state;

  return (
    <>
      <h1 className="sr-only">Hausübersicht — simuliertes Zuhause</h1>
      <section className="sky" data-od-id="sim-controls" aria-label="Simulation steuern">
        <div className="speed" role="group" aria-label="Geschwindigkeit">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className="chipbtn"
              aria-pressed={state.speed === speed}
              disabled={pending}
              onClick={() => {
                void run(() => updateSettings({ speed }));
              }}
            >
              {speed}×
            </button>
          ))}
          <Button
            size="sm"
            aria-pressed={state.paused}
            disabled={pending}
            onClick={() => {
              void run(() => controlSimulation(state.paused ? "resume" : "pause"));
            }}
          >
            {state.paused ? <PlayIcon /> : <PauseIcon />}
            <span className="lbl">{state.paused ? "Fortsetzen" : "Pause"}</span>
          </Button>
        </div>

        <div className="weather" data-od-id="weather">
          <span className="w">
            <WeatherIcon weather={outdoor.weather} />
            {WEATHER_LABELS[outdoor.weather]}
          </span>
          <span className="season">{SEASON_LABELS[outdoor.season]}</span>
          <span className="t">Außen {formatTemperature(outdoor.temperature)}</span>
          <span className="season">{outdoor.is_day ? "Tag" : "Nacht"}</span>
          <div className="sun">
            <span>
              <SunriseIcon />
              Sonnenaufgang {formatClock(outdoor.sunrise)}
            </span>
            <span>
              <SunsetIcon />
              Sonnenuntergang {formatClock(outdoor.sunset)}
            </span>
          </div>
        </div>
      </section>

      {actionError ? (
        <div className="overview-error">
          <Banner tone="error">{actionError}</Banner>
        </div>
      ) : null}

      <div className="house">
        <HouseTotals totals={state.totals} />

        <section className="rooms" data-od-id="rooms" aria-label={`${state.rooms.length} Räume`}>
          <div className="rooms-head">
            <span className="label">Räume · {state.rooms.length}</span>
            <span className="label">Live · simuliert</span>
          </div>
          {state.rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              featured={room.id === "living_room"}
              sparkValues={spark[room.id]}
            />
          ))}
        </section>

        <div className="side">
          <JumpLinks links={JUMP_LINKS} />
        </div>
      </div>
    </>
  );
}
