/**
 * Thresholds screen: the stored limits render with their factory value, a
 * change travels through `updateThreshold`, and a rejected change keeps the
 * displayed figure and reports the German `ApiError` message.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import type { ThresholdOut } from "../../lib/types";
import { Thresholds } from "../../pages/Thresholds";

const api = vi.hoisted(() => ({
  getThresholds: vi.fn(),
  updateThreshold: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    getThresholds: api.getThresholds,
    updateThreshold: api.updateThreshold,
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const THRESHOLDS: ThresholdOut[] = [
  { key: "min_temperature", value: 18, unit: "°C", default_value: 18 },
  { key: "max_temperature", value: 26, unit: "°C", default_value: 26 },
  { key: "max_co2", value: 1000, unit: "ppm", default_value: 1000 },
  { key: "max_power", value: 5000, unit: "W", default_value: 5000 },
  { key: "power_spike_delta", value: 1500, unit: "W", default_value: 1500 },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPage(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/thresholds"]}>
        <Thresholds />
      </MemoryRouter>,
    );
  });

  return container;
}

beforeEach(() => {
  api.getThresholds.mockReset();
  api.updateThreshold.mockReset();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
});

describe("thresholds screen", () => {
  it("renders the limits with their current and factory value", async () => {
    api.getThresholds.mockResolvedValue(THRESHOLDS);

    const view = await renderPage();

    expect(api.getThresholds).toHaveBeenCalledTimes(1);

    const limits = view.querySelectorAll(".limit");
    expect(limits).toHaveLength(5);

    const text = view.textContent ?? "";
    expect(text).toContain("Raum zu kalt");
    expect(text).toContain("18,0 °C");
    expect(text).toContain("Standard: 18,0 °C");
    expect(text).toContain("Raum zu warm");
    expect(text).toContain("26,0 °C");
    expect(text).toContain("CO₂");
    expect(text).toContain("1.000 ppm");
    expect(text).toContain("Leistung");
    expect(text).toContain("5.000 W");
    expect(text).toContain("Luftfeuchte");
    expect(text).toContain("Noch nicht verfügbar – folgt.");

    const humidity = view.querySelector<HTMLButtonElement>(
      '[aria-label="Luftfeuchte-Grenze erhöhen"]',
    );
    expect(humidity?.disabled).toBe(true);
  });

  it("sends a changed threshold and displays the value the server returns", async () => {
    api.getThresholds.mockResolvedValue(THRESHOLDS);
    api.updateThreshold.mockResolvedValue({
      key: "min_temperature",
      value: 18.5,
      unit: "°C",
      default_value: 18,
    });

    const view = await renderPage();
    const increase = view.querySelector<HTMLButtonElement>(
      '[aria-label="Raum zu kalt erhöhen"]',
    );
    expect(increase).not.toBeNull();

    await act(async () => {
      increase?.click();
    });

    expect(api.updateThreshold).toHaveBeenCalledWith("min_temperature", 18.5);

    const coldLimit = view.querySelector('[data-od-id="limit-cold"]');
    const coldValue = coldLimit?.querySelector(".stepper .val");
    expect(coldValue?.textContent).toContain("18,5");
    expect(coldValue?.textContent).toContain("°C");
    expect(coldLimit?.textContent).toContain("Standard: 18,0 °C");
  });

  it("shows the German rejection message and keeps the displayed value", async () => {
    api.getThresholds.mockResolvedValue(THRESHOLDS);
    api.updateThreshold.mockRejectedValue(
      new ApiError("validation_error", "Die Mindesttemperatur muss zwischen 5 und 25 liegen."),
    );

    const view = await renderPage();
    const increase = view.querySelector<HTMLButtonElement>(
      '[aria-label="Raum zu kalt erhöhen"]',
    );

    await act(async () => {
      increase?.click();
    });

    expect(view.textContent).toContain(
      "Die Mindesttemperatur muss zwischen 5 und 25 liegen.",
    );

    const coldLimit = view.querySelector('[data-od-id="limit-cold"]');
    const coldValue = coldLimit?.querySelector(".stepper .val");
    expect(coldValue?.textContent).toContain("18,0");
    expect(coldValue?.textContent).not.toContain("18,5");
    expect(coldLimit?.textContent).toContain("Standard: 18,0 °C");
  });
});
