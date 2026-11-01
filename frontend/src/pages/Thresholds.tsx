import type { ReactElement } from "react";

export function Thresholds(): ReactElement {
  return (
    <section className="page" aria-labelledby="thresholds-title">
      <header className="pagehead">
        <h1 id="thresholds-title">Schwellwerte</h1>
        <p>Grenzen, ab denen das simulierte Haus eine Meldung erzeugt.</p>
      </header>
      <p className="page-note">Die Schwellwertverwaltung folgt in einem späteren Schritt.</p>
    </section>
  );
}
