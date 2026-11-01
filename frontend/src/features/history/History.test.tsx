import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import type { HistorySeries } from "../../lib/types";
import { History } from "../../pages/History";

const { getHistoryMock, exportHistoryUrlMock, houseState } = vi.hoisted(() => ({
  getHistoryMock: vi.fn(),
  exportHistoryUrlMock: vi.fn(),
  houseState: {
    sim_time: "2026-06-15T09:30:00",
    weekday: "Montag",
    tick: 90,
    paused: false,
    speed: 60,
    seed: 4711,
    outdoor: {
      temperature: 22.4,
      weather: "sunny",
      season: "summer",
      is_day: true,
      sunrise: "06:00",
      sunset: "21:00",
      solar_w: 1800,
    },
    totals: { power_w: 2200, solar_w: 1800, grid_w: 400 },
    open_messages: 0,
    rooms: [
      {
        id: "living_room",
        name: "Wohnzimmer",
        sensors: {
          temperature: 21.4,
          humidity: 48,
          co2: 620,
          window_open: false,
          door_open: false,
          motion: true,
          smoke: false,
          water: false,
          power_w: 1200,
        },
        devices: [],
        heating_active: true,
        light_on: false,
        open_messages: 0,
        status_text: "Alles normal",
      },
      {
        id: "kitchen",
        name: "Küche",
        sensors: {
          temperature: 22.0,
          humidity: 52,
          co2: 700,
          window_open: false,
          door_open: false,
          motion: false,
          smoke: false,
          water: false,
          power_w: 900,
        },
        devices: [],
        heating_active: false,
        light_on: false,
        open_messages: 0,
        status_text: "Alles normal",
      },
    ],
  },
}));

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => ({ state: houseState, connected: true, error: null }),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  exportHistoryUrlMock.mockImplementation(actual.exportHistoryUrl);
  return {
    ...actual,
    getHistory: getHistoryMock,
    exportHistoryUrl: exportHistoryUrlMock,
  };
});

const SERIES: HistorySeries = {
  room_id: "living_room",
  metric: "temperature",
  window: "1h",
  unit: "°C",
  points: [
    { t: "2026-06-15T08:30:00", value: 20.1 },
    { t: "2026-06-15T09:00:00", value: 20.8 },
    { t: "2026-06-15T09:30:00", value: 21.4 },
  ],
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderHistory(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <History />
      </MemoryRouter>,
    );
  });
  return container;
}

function chooseSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

beforeEach(() => {
  getHistoryMock.mockReset();
  getHistoryMock.mockResolvedValue(SERIES);
  exportHistoryUrlMock.mockClear();
});

describe("history screen", () => {
  it("queries the recorded series for room, metric and window", async () => {
    const view = await renderHistory();

    await vi.waitFor(() => {
      expect(getHistoryMock).toHaveBeenCalledWith({
        room_id: "living_room",
        metric: "temperature",
        window: "1h",
      });
    });

    const humidity = view.querySelector<HTMLButtonElement>('[data-metric="humidity"]');
    const day = view.querySelector<HTMLButtonElement>('[data-window="1d"]');
    const room = view.querySelector<HTMLSelectElement>('select[aria-label="Raum"]');
    expect(humidity).not.toBeNull();
    expect(day).not.toBeNull();
    expect(room).not.toBeNull();

    await act(async () => {
      humidity?.click();
      day?.click();
    });
    await act(async () => {
      if (room) {
        chooseSelect(room, "kitchen");
      }
    });

    await vi.waitFor(() => {
      expect(getHistoryMock).toHaveBeenLastCalledWith({
        room_id: "kitchen",
        metric: "humidity",
        window: "1d",
      });
    });
  });

  it("follows the current selection in the export URL and file name", async () => {
    const view = await renderHistory();

    await vi.waitFor(() => {
      expect(view.querySelector(".fname")?.textContent).toBe(
        "wohnzimmer_temperatur_1h.csv",
      );
    });

    const humidity = view.querySelector<HTMLButtonElement>('[data-metric="humidity"]');
    const day = view.querySelector<HTMLButtonElement>('[data-window="1d"]');
    const room = view.querySelector<HTMLSelectElement>('select[aria-label="Raum"]');

    await act(async () => {
      humidity?.click();
      day?.click();
    });
    await act(async () => {
      if (room) {
        chooseSelect(room, "kitchen");
      }
    });

    await vi.waitFor(() => {
      expect(exportHistoryUrlMock).toHaveBeenCalledWith({
        room_id: "kitchen",
        metric: "humidity",
        window: "1d",
      });
    });

    const singleUrl = exportHistoryUrlMock.mock.results.at(-1)?.value as string;
    expect(singleUrl).toContain("/api/history/export?");
    expect(singleUrl).toContain("room_id=kitchen");
    expect(singleUrl).toContain("metric=humidity");
    expect(singleUrl).toContain("window=1d");
    expect(view.querySelector(".fname")?.textContent).toBe(
      "kueche_luftfeuchte_1d.csv",
    );

    const allMetrics = view.querySelector<HTMLInputElement>(
      '.export input[type="checkbox"]',
    );
    expect(allMetrics).not.toBeNull();
    await act(async () => {
      allMetrics?.click();
    });

    await vi.waitFor(() => {
      expect(exportHistoryUrlMock).toHaveBeenLastCalledWith({
        room_id: "kitchen",
        metric: "all",
        window: "1d",
      });
    });
    const allUrl = exportHistoryUrlMock.mock.results.at(-1)?.value as string;
    expect(allUrl).toContain("metric=all");
    expect(view.querySelector(".fname")?.textContent).toBe(
      "kueche_alle-messgroessen_1d.csv",
    );
  });

  it("renders the curve when the series arrives after the simulated clock advanced", async () => {
    const pending: Array<(series: HistorySeries) => void> = [];
    getHistoryMock.mockImplementation(
      () =>
        new Promise<HistorySeries>((resolve) => {
          pending.push(resolve);
        }),
    );

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const element = (
      <MemoryRouter>
        <History />
      </MemoryRouter>
    );
    await act(async () => {
      root?.render(element);
    });

    await vi.waitFor(() => {
      expect(getHistoryMock).toHaveBeenCalledTimes(1);
    });

    houseState.sim_time = "2026-06-15T09:31:00";
    await act(async () => {
      root?.render(element);
    });

    await act(async () => {
      pending[0]?.(SERIES);
    });

    await vi.waitFor(() => {
      expect(container?.querySelector("svg.chart path.ln")).not.toBeNull();
    });

    houseState.sim_time = "2026-06-15T09:30:00";
  });

  it("shows the value, unit and time of the reading under the pointer", async () => {
    const view = await renderHistory();
    await vi.waitFor(() => {
      expect(view.querySelector("svg.chart path.ln")).not.toBeNull();
    });
    const svg = view.querySelector("svg.chart") as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0 }) as DOMRect;

    await act(async () => {
      svg.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 210, pointerType: "mouse" }),
      );
    });

    const readout = view.querySelector('[data-testid="chart-readout"]') as HTMLElement;
    expect(readout.hidden).toBe(false);
    expect(readout.querySelector("b")?.textContent).toBe("20,8 °C");
    expect(readout.querySelector("span")?.textContent).toBe("09:00");
  });

  it("names the weekday on the time axis of the one-day window", async () => {
    getHistoryMock.mockResolvedValue({
      ...SERIES,
      window: "1d",
      points: [
        { t: "2026-06-15T08:30:00", value: 20.1 },
        { t: "2026-06-15T20:30:00", value: 20.8 },
        { t: "2026-06-16T08:29:00", value: 21.4 },
      ],
    });
    const view = await renderHistory();
    const day = view.querySelector<HTMLButtonElement>('[data-window="1d"]');
    await act(async () => {
      day?.click();
    });

    await vi.waitFor(() => {
      const labels = Array.from(view.querySelectorAll(".chartwrap .axis span")).map(
        (label) => label.textContent,
      );
      expect(labels).toEqual(expect.arrayContaining(["Mo 08:30", "Mo 20:30", "Di 08:29"]));
    });
  });

  it("shows the German empty state for a series without readings", async () => {
    getHistoryMock.mockResolvedValue({ ...SERIES, points: [] });

    const view = await renderHistory();

    await vi.waitFor(() => {
      expect(view.querySelector(".empty")?.textContent).toContain(
        "Keine Messwerte im gewählten Zeitraum.",
      );
    });
  });

  it("shows the German message of a rejected query", async () => {
    getHistoryMock.mockRejectedValue(
      new ApiError("invalid_query", "Ungültige Anfrage."),
    );

    const view = await renderHistory();

    await vi.waitFor(() => {
      expect(view.textContent).toContain("Ungültige Anfrage.");
    });
  });
});
