/**
 * Series region of the history screen.
 *
 * Draws the recorded readings of the current selection with the kit's
 * ChartFrame. The axis above the chart names the highest, the newest and the
 * lowest reading of the series; the axis below carries the simulated clock.
 */

import type { ReactElement } from "react";

import {
  formatCo2,
  formatHumidity,
  formatPower,
  formatSimTime,
  formatTemperature,
} from "../../lib/format";
import type { HistoryMetric, HistorySeries, HistoryWindow } from "../../lib/types";
import { Banner, ChartFrame, Group } from "../../ui";

export interface HistoryChartProps {
  series: HistorySeries | null;
  loading: boolean;
  error: string | null;
  roomName: string;
  metric: HistoryMetric;
  window: HistoryWindow;
  simTime: string;
}

const METRIC_LABELS: Record<HistoryMetric, string> = {
  temperature: "Temperatur",
  humidity: "Luftfeuchte",
  co2: "CO₂",
  power: "Verbrauch",
};

const WINDOW_LABELS: Record<HistoryWindow, string> = {
  "15m": "letzte 15 Minuten",
  "1h": "letzte Stunde",
  "1d": "letzter Tag",
};

function metricValue(metric: HistoryMetric, value: number): string {
  switch (metric) {
    case "temperature":
      return formatTemperature(value);
    case "humidity":
      return formatHumidity(value);
    case "co2":
      return formatCo2(value);
    case "power":
      return formatPower(value);
  }
}

function axisTimes(series: HistorySeries | null): string[] {
  const points = series?.points ?? [];
  if (points.length < 2) {
    return [];
  }
  const lastIndex = points.length - 1;
  return [
    formatSimTime(points[0].t),
    formatSimTime(points[Math.floor(lastIndex / 2)].t),
    formatSimTime(points[lastIndex].t),
  ];
}

export function HistoryChart({
  series,
  loading,
  error,
  roomName,
  metric,
  window,
  simTime,
}: HistoryChartProps): ReactElement {
  const points = series?.points ?? [];
  const values = points.map((point) => point.value);
  const hasValues = values.length > 0;
  const newest = hasValues ? values[values.length - 1] : 0;
  const highest = hasValues ? Math.max(...values) : 0;
  const lowest = hasValues ? Math.min(...values) : 0;
  const room = roomName || "Raum";

  return (
    <Group className="chartwrap" ariaLabel="Laufende Messreihe">
      <p className="seriesname" id="series-name">
        <b>{room}</b> · {METRIC_LABELS[metric]} · {WINDOW_LABELS[window]} · Simulation
      </p>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {hasValues ? (
        <div className="axis">
          <span>
            Max <b>{metricValue(metric, highest)}</b>
          </span>
          <span>
            Jetzt <b>{metricValue(metric, newest)}</b>
          </span>
          <span>
            Min <b>{metricValue(metric, lowest)}</b>
          </span>
        </div>
      ) : null}
      <ChartFrame
        tall
        points={values}
        ariaLabel={`${METRIC_LABELS[metric]}verlauf ${room}, ${WINDOW_LABELS[window]}`}
        axisLabels={axisTimes(series)}
        emptyText={
          loading && !error
            ? "Die Messreihe wird geladen …"
            : "Keine Messwerte im gewählten Zeitraum."
        }
      >
        <span className="sr-only">Simulierte Uhrzeit: {formatSimTime(simTime)}</span>
      </ChartFrame>
    </Group>
  );
}
