/**
 * Header slot of the application shell.
 *
 * This is the skeleton's version of the sim-bar: it renders the simulated
 * clock, the seed and the live-connection state. The UI kit ticket owns the
 * final frame region and can extend this file without touching the shell.
 */

import type { ReactElement } from "react";

import { formatInteger, formatSimTime, formatWeekday, formatWeekdayShort } from "../lib/format";

export interface HeaderProps {
  simTime: string;
  weekday: string;
  speed: number;
  paused: boolean;
  connected: boolean;
  seed: number;
}

export function Header({
  simTime,
  weekday,
  speed,
  paused,
  connected,
  seed,
}: HeaderProps): ReactElement {
  const time = formatSimTime(simTime);
  const day = formatWeekdayShort(weekday);
  const connectionText = connected ? "Live-Verbindung aktiv" : "Keine Live-Verbindung";
  const runText = paused ? "Simulation pausiert" : `Simulation läuft mit ${speed}×`;
  const clockLabel = `Simulierte Uhrzeit ${formatWeekday(weekday)} ${time}`.trim();

  return (
    <header className="simbar" data-od-id="sim-bar">
      <span className="tag">Simuliert</span>
      <span className="seed">Seed {formatInteger(seed)}</span>
      <span className="sr-only">
        {connectionText}, {runText}
      </span>
      <div className="clock" aria-label={clockLabel}>
        <span className="day">{day}</span>
        <span>{time}</span>
      </div>
    </header>
  );
}
