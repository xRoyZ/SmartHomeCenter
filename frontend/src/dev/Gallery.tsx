import type { ReactElement } from "react";

export function Gallery(): ReactElement {
  return (
    <section className="page" aria-labelledby="gallery-title">
      <header className="pagehead">
        <h1 id="gallery-title">Komponenten-Galerie</h1>
        <p>Entwicklungsansicht der Bausteine des UI-Kits.</p>
      </header>
      <p className="page-note">Die Galerie wird vom UI-Kit gefüllt.</p>
    </section>
  );
}
