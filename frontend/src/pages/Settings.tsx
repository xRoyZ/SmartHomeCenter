import type { ReactElement } from "react";

export function Settings(): ReactElement {
  return (
    <section className="page" aria-labelledby="settings-title">
      <header className="pagehead">
        <h1 id="settings-title">Einstellungen</h1>
        <p>Wetter, Jahreszeit, Bewohnerverhalten, Geschwindigkeit und Seed.</p>
      </header>
      <p className="page-note">Die Simulationseinstellungen folgen in einem späteren Schritt.</p>
    </section>
  );
}
