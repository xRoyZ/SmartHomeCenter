/**
 * Measurement history region of the device detail screen.
 *
 * The chart draws the series the device API returns for the device's room:
 * the room temperature for a heating device and the electrical draw for the
 * switched devices. The heating setpoint is drawn as the dashed reference line
 * exactly as the approved mockup shows it.
 */

import type { ReactElement } from "react";

import { formatInteger, formatSimTime } from "../../lib/format";
import type {
  DeviceState,
  HistoryMetric,
  HistorySeries,
} from "../../lib/types";
import { ChartFrame, type ChartLegendItem } from "../../ui";

export interface DeviceHistoryChartProps {
  device: DeviceState;
  roomName: string;
  series: HistorySeries[];
}

const METRIC_FOR_TYPE: Record<DeviceState["type"], HistoryMetric> = {
  heating: "temperature",
  light: "power",
  shutter: "power",
  plug: "power",
  appliance: "power",
};

const METRIC_LABEL: Record<HistoryMetric, string> = {
  temperature: "Raumtemperatur",
  humidity: "Luftfeuchte",
  co2: "CO₂",
  power: "Verbrauch",
};

const WINDOW_LABEL: Record<string, string> = {
  "15m": "letzte 15 Minuten",
  "1h": "letzte 60 Minuten",
  "1d": "letzter Tag",
};

function windowTitle(window: string): string {
  return WINDOW_LABEL[window] ?? `letzte ${window}`;
}

function axisLabels(series: HistorySeries | undefined): string[] {
  if (!series || series.points.length < 2) {
    return [];
  }
  const last = series.points.length - 1;
  const middle = Math.floor(last / 2);
  return [0, middle, last].map((index) => formatSimTime(series.points[index].t));
}

export function DeviceHistoryChart({
  device,
  roomName,
  series,
}: DeviceHistoryChartProps): ReactElement {
  const preferred = METRIC_FOR_TYPE[device.type];
  const selected =
    series.find((item) => item.metric === preferred) ?? series[0] ?? null;
  const metric = selected?.metric ?? preferred;
  const points = selected?.points.map((point) => point.value) ?? [];
  const window = selected?.window ?? "15m";
  const title = windowTitle(window);
  const metricLabel = METRIC_LABEL[metric];

  const referenceValue =
    device.type === "heating" && device.target_temp !== null
      ? device.target_temp
      : undefined;

  const legend: ChartLegendItem[] = [
    {
      label:
        metric === "temperature" ? "Raumtemperatur Ist" : metricLabel,
    },
  ];
  if (referenceValue !== undefined) {
    legend.push({ label: "Solllinie gestrichelt", dashed: true });
  }

  const ariaLabel =
    referenceValue !== undefined
      ? `${metricLabel} ${roomName}, ${title}, Solllinie bei ${formatInteger(referenceValue)} Grad Celsius`
      : `${metricLabel} ${roomName}, ${title}`;

  return (
    <section
      className="group chartwrap"
      data-od-id="device-chart"
      aria-label={`Messwertverlauf der ${title}`}
    >
      <h2>{`Messwertverlauf · ${title}`}</h2>
      <ChartFrame
        points={points}
        ariaLabel={ariaLabel}
        axisLabels={axisLabels(selected ?? undefined)}
        legend={legend}
        referenceValue={referenceValue}
        emptyText="Für dieses Gerät liegen noch keine Messwerte vor."
      />
    </section>
  );
}
