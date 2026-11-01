import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "../lib/cn";
import { formatNumber, formatSimTime } from "../lib/format";
import { EmptyState } from "./EmptyState";

export interface ChartLegendItem {
  label: ReactNode;
  dashed?: boolean;
}

export interface ChartFrameProps {
  points: readonly number[];
  ariaLabel: string;
  /**
   * Simulated timestamps of the points, in the same order. With them the
   * readout under the pointer names the time of the value as well.
   */
  times?: readonly string[];
  /** Formats a value for the readout under the pointer, unit included. */
  formatValue?: (value: number) => string;
  /** Formats a timestamp of ``times`` for the readout (default ``HH:MM``). */
  formatTime?: (time: string) => string;
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

function defaultValue(value: number): string {
  return formatNumber(value, 1);
}

interface Readout {
  left: number;
  top: number;
  tipLeft: number;
}

export function ChartFrame({
  points,
  ariaLabel,
  times,
  formatValue = defaultValue,
  formatTime = formatSimTime,
  axisLabels,
  legend,
  referenceValue,
  tall = false,
  right = false,
  emptyText = "Keine Messwerte im gewählten Zeitraum.",
  className,
  children,
}: ChartFrameProps): ReactElement {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);

  const height = tall ? 200 : 140;
  const lines = gridLines(tall);
  const topPad = lines[0];
  const count = points.length;
  const index = active === null || count < 2 ? null : Math.min(active, count - 1);

  const values = referenceValue === undefined ? points : [...points, referenceValue];
  let min = count > 0 ? Math.min(...values) : 0;
  let max = count > 0 ? Math.max(...values) : 1;
  if (max - min < 1e-9) {
    min -= 1;
    max += 1;
  }

  const yFor = (value: number): number =>
    topPad + (1 - (value - min) / (max - min)) * (height - topPad * 2);
  const xFor = (position: number): number => (position / Math.max(count - 1, 1)) * WIDTH;

  // Place the dot on the point and the readout above it, kept inside the
  // chart's box (the drawn line bleeds past it, the readout must not).
  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (index === null || !wrap || !svg) {
      setReadout(null);
      return;
    }
    const box = svg.getBoundingClientRect();
    const frame = wrap.getBoundingClientRect();
    const left = box.left - frame.left + (xFor(index) / WIDTH) * box.width;
    const top = box.top - frame.top + (yFor(points[index]) / height) * box.height;
    const half = (tipRef.current?.offsetWidth ?? 0) / 2;
    const tipLeft =
      frame.width > 2 * half ? Math.min(frame.width - half, Math.max(half, left)) : left;
    setReadout({ left, top, tipLeft });
    // The geometry follows the chosen point, the series and the scale.
  }, [index, points, min, max, height]);

  // A touch readout stays until the next touch outside the chart.
  useEffect(() => {
    if (index === null) {
      return undefined;
    }
    const dismiss = (event: Event): void => {
      if (svgRef.current && !svgRef.current.contains(event.target as Node)) {
        setActive(null);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [index]);

  if (count < 2) {
    return (
      <div className={cn("chartwrap", className)}>
        <EmptyState>{emptyText}</EmptyState>
      </div>
    );
  }

  const coordinates = points.map(
    (value, position) => `${xFor(position).toFixed(2)} ${yFor(value).toFixed(2)}`,
  );
  const linePath = `M${coordinates.join(" L")}`;
  const areaPath = `${linePath} L${WIDTH} ${height} L0 ${height} Z`;

  const pointAt = (clientX: number): number => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) {
      return count - 1;
    }
    const fraction = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return Math.round(fraction * (count - 1));
  };

  const onPointer = (event: PointerEvent<SVGSVGElement>): void => {
    setActive(pointAt(event.clientX));
  };

  const onPointerLeave = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.pointerType === "mouse") {
      setActive(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    const current = index ?? count - 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = Math.max(0, current - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = Math.min(count - 1, current + 1);
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = count - 1;
    } else if (event.key === "Escape") {
      setActive(null);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  };

  const valueText = index === null ? "" : formatValue(points[index]);
  const timeText = index !== null && times && times[index] ? formatTime(times[index]) : "";

  return (
    <div className={cn("chartwrap", className)} ref={wrapRef}>
      <svg
        ref={svgRef}
        className={cn("chart", tall && "tall", right && "right")}
        viewBox={`0 0 ${WIDTH} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${ariaLabel}. Pfeiltasten zeigen die einzelnen Messwerte.`}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={onPointerLeave}
        onPointerCancel={() => setActive(null)}
        onFocus={() => setActive((current) => current ?? count - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
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
      <div
        ref={tipRef}
        className="charttip"
        hidden={index === null}
        aria-hidden="true"
        data-testid="chart-readout"
        style={readout ? { left: readout.tipLeft, top: readout.top } : undefined}
      >
        <b>{valueText}</b>
        {timeText ? <span>{timeText}</span> : null}
      </div>
      <i
        className="chartdot"
        hidden={index === null}
        aria-hidden="true"
        style={readout ? { left: readout.left, top: readout.top } : undefined}
      />
      <span className="sr-only" aria-live="polite">
        {index === null ? "" : timeText ? `${valueText} um ${timeText}` : valueText}
      </span>
      {axisLabels && axisLabels.length > 0 ? (
        <div className="axis">
          {axisLabels.map((label, position) => (
            <span key={position}>{label}</span>
          ))}
        </div>
      ) : null}
      {legend && legend.length > 0 ? (
        <div className="legend">
          {legend.map((item, position) => (
            <span key={position}>
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
