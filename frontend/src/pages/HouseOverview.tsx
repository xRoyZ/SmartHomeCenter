import type { ReactElement } from "react";

export function HouseOverview(): ReactElement {
  return (
    <section className="page" aria-labelledby="house-overview-title">
      <header className="pagehead">
        <h1 id="house-overview-title">Hausübersicht</h1>
        <p>Alle Räume und die Energie des Hauses auf einen Blick.</p>
      </header>
      <p className="page-note">Die Live-Anzeige dieses Bereichs folgt in einem späteren Schritt.</p>
    </section>
  );
}
