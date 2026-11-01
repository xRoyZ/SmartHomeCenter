/**
 * Energy band of the house overview.
 *
 * The net grid draw is the lead figure of the start page. Solar yield and the
 * whole house's consumption sit beneath it, and the bar relates both to the
 * same reference so the two figures can be read against each other. Every
 * number comes from the live `HouseState` totals.
 */

import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import type { HouseTotals as HouseTotalsData } from "../../lib/types";

const BAR_REFERENCE_W = 3500;

export interface HouseTotalsProps {
  totals: HouseTotalsData;
  className?: string;
}

function share(watts: number): number {
  if (!Number.isFinite(watts) || watts <= 0) {
    return 0;
  }
  return Math.min(1, watts / BAR_REFERENCE_W);
}

function kilowatts(watts: number): string {
  return `${formatNumber(watts / 1000, 2)} kW`;
}

export function HouseTotals({ totals, className }: HouseTotalsProps): ReactElement {
  const gridW = Math.max(0, totals.grid_w);
  const gridKw = formatNumber(gridW / 1000, 2);

  return (
    <section className={cn("energy", className)} data-od-id="energy" aria-label="Energie des Hauses">
      <div className="label">Netzbezug</div>
      <div className="figure">
        <span className="n" data-net>
          {gridKw}
        </span>
        <span className="u">kW</span>
      </div>
      <div className="side">
        <span>
          Solar<b data-solar>{kilowatts(totals.solar_w)}</b>
        </span>
        <span>
          Haus<b data-haus>{kilowatts(totals.power_w)}</b>
        </span>
      </div>
      <div
        className="bar"
        role="img"
        aria-label={`Netzbezug und Solar im Verhältnis zu ${formatNumber(
          BAR_REFERENCE_W / 1000,
          1,
        )} kW`}
      >
        <i
          className="grid"
          data-bar-grid
          style={{ width: "100%", transform: `scaleX(${share(gridW)})` }}
        />
        <i
          className="solar"
          data-bar-solar
          style={{ width: "100%", transform: `scaleX(${share(totals.solar_w)})` }}
        />
      </div>
    </section>
  );
}
