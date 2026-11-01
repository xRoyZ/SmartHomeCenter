import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";
import { EmptyState } from "./EmptyState";

export interface ChartLegendItem {
  label: ReactNode;
  dashed?: boolean;
}

export interface ChartFrameProps {
  points: readonly number[];
  ariaLabel: string;
  axisLabels?: readonly ReactNode[];
  legend?: readonly ChartLegendItem[];
  referenceValue?: number;
  tall?: boolean;
  right?: boolean;
  emptyText?: string;
  className?: string;
  children?: ReactNode;
}

const WIDTH = 400;

function gridLines(tall: boolean): number[] {
  return tall ? [20, 70, 120, 170] : [10, 70, 130];
}

export function ChartFrame({
  points,
  ariaLabel,
  axisLabels,
  legend,
  referenceValue,
  tall = false,
  right = false,
  emptyText = "Keine Messwerte im gewählten Zeitraum.",
  className,
  children,
}: ChartFrameProps): ReactElement {
  const height = tall ? 200 : 140;
  const lines = gridLines(tall);
  const topPad = lines[0];

  if (points.length < 2) {
    return (
      <div className={cn("chartwrap", className)}>
        <EmptyState>{emptyText}</EmptyState>
      </div>
    );
  }

  const values = referenceValue === undefined ? points : [...points, referenceValue];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }

  const yFor = (value: number): number =>
    topPad + (1 - (value - min) / (max - min)) * (height - topPad * 2);

  const coordinates = points.map((value, index) => {
    const x = (index / (points.length - 1)) * WIDTH;
    return `${x.toFixed(2)} ${yFor(value).toFixed(2)}`;
  });
  const linePath = `M${coordinates.join(" L")}`;
  const areaPath = `${linePath} L${WIDTH} ${height} L0 ${height} Z`;

  return (
    <div className={cn("chartwrap", className)}>
      <svg
        className={cn("chart", tall && "tall", right && "right")}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        {lines.map((y) => (
          <line key={y} className="grid" x1="0" y1={y} x2={WIDTH} y2={y} />
        ))}
        <path className="area" d={areaPath} />
        <path className="ln" d={linePath} />
        {referenceValue !== undefined ? (
          <line
            className="set"
            x1="0"
            y1={yFor(referenceValue).toFixed(2)}
            x2={WIDTH}
            y2={yFor(referenceValue).toFixed(2)}
          />
        ) : null}
      </svg>
      {axisLabels && axisLabels.length > 0 ? (
        <div className="axis">
          {axisLabels.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
      ) : null}
      {legend && legend.length > 0 ? (
        <div className="legend">
          {legend.map((item, index) => (
            <span key={index}>
              <i className={item.dashed ? "dash" : undefined} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}
