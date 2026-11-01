import type { ReactElement } from "react";

export function History(): ReactElement {
  return (
    <section className="page" aria-labelledby="history-title">
      <header className="pagehead">
        <h1 id="history-title">Verlauf</h1>
        <p>Temperatur, Luftfeuchte, CO₂ und Verbrauch über die Zeit.</p>
      </header>
      <p className="page-note">Die Verlaufsdiagramme folgen in einem späteren Schritt.</p>
    </section>
  );
}
