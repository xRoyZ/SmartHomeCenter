import type { ReactElement } from "react";

export function DeviceDetail(): ReactElement {
  return (
    <section className="page" aria-labelledby="device-detail-title">
      <header className="pagehead">
        <h1 id="device-detail-title">Gerätedetail</h1>
        <p>Zustand, Verlauf und letzte Aktion eines Geräts.</p>
      </header>
      <p className="page-note">Die Geräteansicht folgt in einem späteren Schritt.</p>
    </section>
  );
}
