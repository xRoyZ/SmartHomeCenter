import type { ReactElement } from "react";

export function RoomDetail(): ReactElement {
  return (
    <section className="page" aria-labelledby="room-detail-title">
      <header className="pagehead">
        <h1 id="room-detail-title">Raumdetail</h1>
        <p>Sensorwerte und Geräte eines Raums.</p>
      </header>
      <p className="page-note">Die Raumansicht folgt in einem späteren Schritt.</p>
    </section>
  );
}
