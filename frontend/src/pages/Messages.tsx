import type { ReactElement } from "react";

export function Messages(): ReactElement {
  return (
    <section className="page" aria-labelledby="messages-title">
      <header className="pagehead">
        <h1 id="messages-title">Meldungen</h1>
        <p>Offene und bestätigte Hinweise des simulierten Hauses.</p>
      </header>
      <p className="page-note">Die Meldungsliste folgt in einem späteren Schritt.</p>
    </section>
  );
}
