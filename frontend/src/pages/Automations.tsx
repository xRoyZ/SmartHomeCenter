import type { ReactElement } from "react";

export function Automations(): ReactElement {
  return (
    <section className="page" aria-labelledby="automations-title">
      <header className="pagehead">
        <h1 id="automations-title">Automationen</h1>
        <p>Regeln aus Bedingung und Aktion, samt Ausführungsprotokoll.</p>
      </header>
      <p className="page-note">Die Automationsverwaltung folgt in einem späteren Schritt.</p>
    </section>
  );
}
