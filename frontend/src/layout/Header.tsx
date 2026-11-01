/**
 * Header slot of the application shell.
 *
 * Renders the frame's sim-bar region: the visible simulation notice, the seed
 * the run was started with and the simulated wall clock. The running state and
 * the live connection are carried for screen readers so the figures are never
 * mistaken for measurements of a real house.
 */

import type { ReactElement } from "react";

import { SimClock } from "../ui";

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
  const connectionText = connected ? "Live-Verbindung aktiv" : "Keine Live-Verbindung";
  const runText = paused ? "Simulation pausiert" : `Simulation läuft mit ${speed}×`;

  return (
    <header className="simbar" data-od-id="sim-bar">
      <span className="tag">Simuliert</span>
      <span className="seed">Seed {seed}</span>
      <span className="sr-only">{`${connectionText}, ${runText}`}</span>
      <SimClock simTime={simTime} weekday={weekday} />
    </header>
  );
}
