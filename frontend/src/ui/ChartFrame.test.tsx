import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatTemperature } from "../lib/format";
import { ChartFrame } from "./ChartFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const POINTS = [20.4, 20.8, 21.6, 21.2, 22.0];
const TIMES = [
  "2026-06-15T07:38:00",
  "2026-06-15T07:39:00",
  "2026-06-15T07:40:00",
  "2026-06-15T07:41:00",
  "2026-06-15T07:42:00",
];

let container: HTMLDivElement;
let root: Root;

function render(): SVGSVGElement {
  act(() => {
    root.render(
      <ChartFrame
        points={POINTS}
        times={TIMES}
        formatValue={formatTemperature}
        ariaLabel="Temperaturverlauf Wohnzimmer"
      />,
    );
  });
  const svg = container.querySelector("svg.chart") as SVGSVGElement;
  // jsdom has no layout: the chart is 400 px wide, starting at x = 100.
  svg.getBoundingClientRect = () =>
    ({ left: 100, top: 0, right: 500, bottom: 140, width: 400, height: 140, x: 100, y: 0 }) as DOMRect;
  return svg;
}

function pointer(target: Element, type: string, clientX: number, pointerType: string): void {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX, pointerType }));
  });
}

// React derives pointerleave from pointerout towards an element outside.
function leave(target: Element, pointerType: string): void {
  act(() => {
    target.dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, pointerType, relatedTarget: document.body }),
    );
  });
}

function readout(): HTMLElement {
  return container.querySelector('[data-testid="chart-readout"]') as HTMLElement;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ChartFrame readout", () => {
  it("shows the value and time under the mouse pointer and hides on leave", () => {
    const svg = render();
    expect(readout().hidden).toBe(true);

    // x = 300 is the middle of the chart: the third point.
    pointer(svg, "pointermove", 300, "mouse");
    expect(readout().hidden).toBe(false);
    expect(readout().textContent).toBe("21,6 °C07:40");

    pointer(svg, "pointermove", 500, "mouse");
    expect(readout().textContent).toBe("22,0 °C07:42");

    leave(svg, "mouse");
    expect(readout().hidden).toBe(true);
  });

  it("keeps a touched value visible until the next touch outside the chart", () => {
    const svg = render();

    pointer(svg, "pointerdown", 100, "touch");
    leave(svg, "touch");
    expect(readout().hidden).toBe(false);
    expect(readout().textContent).toBe("20,4 °C07:38");

    pointer(document.body, "pointerdown", 0, "touch");
    expect(readout().hidden).toBe(true);
  });

  it("steps through the values with the keyboard and announces them", () => {
    const svg = render();
    expect(svg.getAttribute("tabindex")).toBe("0");

    act(() => svg.focus());
    expect(readout().textContent).toBe("22,0 °C07:42");

    act(() => {
      svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(readout().textContent).toBe("21,2 °C07:41");
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "21,2 °C um 07:41",
    );

    act(() => {
      svg.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(readout().textContent).toBe("20,4 °C07:38");

    act(() => svg.blur());
    expect(readout().hidden).toBe(true);
  });
});
