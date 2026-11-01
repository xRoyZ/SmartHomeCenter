import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import type { HouseState, MessageOut, SettingsOut } from "../../lib/types";
import { Settings } from "../../pages/Settings";

const fixtures = vi.hoisted(() => ({
  state: {
    sim_time: "2026-11-01T07:42:00",
    weekday: "Dienstag",
    tick: 12,
    paused: false,
    speed: 60,
    seed: 4711,
    outdoor: {
      temperature: 6.4,
      weather: "cloudy",
      season: "winter",
      is_day: true,
      sunrise: "07:12",
      sunset: "17:38",
      solar_w: 0,
    },
    totals: { power_w: 3260, solar_w: 420, grid_w: 2840 },
    open_messages: 0,
    rooms: [],
  },
  settings: {
    weather: "cloudy",
    season: "winter",
    occupancy_mode: "everyday",
    speed: 60,
    seed: 4711,
    paused: false,
    sim_time: "2026-11-01T07:42:00",
    weekday: "Dienstag",
  },
  message: {
    id: "message-1",
    kind: "smoke",
    severity: "critical",
    room_id: "kitchen",
    room_name: "Küche",
    text: "Rauchmelder in Küche hat ausgelöst.",
    created_at: "2026-11-01T07:43:00",
    acknowledged_at: null,
  },
}));

const apiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  controlSimulation: vi.fn(),
  resetSimulation: vi.fn(),
  triggerEvent: vi.fn(),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, ...apiMocks };
});

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => ({ state: fixtures.state, connected: true, error: null }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function buttonByText(view: HTMLElement, text: string): HTMLButtonElement | null {
  return (
    Array.from(view.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === text,
    ) ?? null
  );
}

async function waitFor(assertion: () => void): Promise<void> {
  const started = Date.now();
  let failure: unknown = null;
  while (Date.now() - started < 2000) {
    try {
      assertion();
      return;
    } catch (error) {
      failure = error;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw failure;
}

async function renderSettings(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Settings />
      </MemoryRouter>,
    );
  });
  await waitFor(() => {
    expect(buttonByText(container as HTMLElement, "Bewölkt")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
  return container;
}

beforeEach(() => {
  apiMocks.getSettings.mockResolvedValue(fixtures.settings as SettingsOut);
  apiMocks.updateSettings.mockImplementation(async (update: Partial<SettingsOut>) => ({
    ...fixtures.settings,
    ...update,
  }));
  apiMocks.controlSimulation.mockImplementation(async (action: "pause" | "resume") => ({
    ...fixtures.settings,
    paused: action === "pause",
  }));
  apiMocks.resetSimulation.mockResolvedValue({
    state: fixtures.state as HouseState,
    settings: fixtures.settings as SettingsOut,
  });
  apiMocks.triggerEvent.mockResolvedValue({
    message: fixtures.message as MessageOut,
    state: fixtures.state as HouseState,
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe("settings screen", () => {
  it("sends a weather change to the running simulation", async () => {
    const view = await renderSettings();
    const sunny = buttonByText(view, "Sonnig");

    expect(sunny).not.toBeNull();
    await act(async () => {
      sunny?.click();
    });

    expect(apiMocks.updateSettings).toHaveBeenCalledWith({ weather: "sunny" });
    await waitFor(() => {
      expect(buttonByText(view, "Sonnig")?.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("pauses and resumes the simulation through the control endpoint", async () => {
    const view = await renderSettings();
    const pause = buttonByText(view, "Pause");

    expect(pause).not.toBeNull();
    await act(async () => {
      pause?.click();
    });

    expect(apiMocks.controlSimulation).toHaveBeenCalledWith("pause");
    await waitFor(() => {
      expect(buttonByText(view, "Fortsetzen")).not.toBeNull();
    });

    await act(async () => {
      buttonByText(view, "Fortsetzen")?.click();
    });

    expect(apiMocks.controlSimulation).toHaveBeenLastCalledWith("resume");
  });

  it("rejects a non-integer seed before calling the API", async () => {
    const view = await renderSettings();
    const input = view.querySelector<HTMLInputElement>(".seedrow input.field");
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    expect(input).not.toBeNull();
    await act(async () => {
      valueSetter?.call(input, "vier");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      buttonByText(view, "Seed übernehmen")?.click();
    });

    expect(view.textContent).toContain(
      "Der Seed muss eine ganze Zahl sein, zum Beispiel 4711.",
    );
    expect(apiMocks.updateSettings).not.toHaveBeenCalled();
  });

  it("resets the simulation with both options", async () => {
    const view = await renderSettings();
    const boxes = Array.from(
      view.querySelectorAll<HTMLInputElement>(".reset-zone input[type='checkbox']"),
    );

    expect(boxes).toHaveLength(2);
    await act(async () => {
      boxes[0].click();
      boxes[1].click();
    });

    const resetButton = buttonByText(view, "Zurücksetzen");
    expect(resetButton).not.toBeNull();
    await act(async () => {
      resetButton?.click();
    });

    expect(apiMocks.resetSimulation).toHaveBeenCalledWith({
      reset_automations: true,
      reset_thresholds: true,
    });
  });

  it("shows the German message of a rejected change and keeps the controls usable", async () => {
    apiMocks.updateSettings.mockRejectedValueOnce(
      new ApiError("validation_error", "Dieser Wert ist ungültig."),
    );
    const view = await renderSettings();

    await act(async () => {
      buttonByText(view, "Gewitter")?.click();
    });

    await waitFor(() => {
      expect(view.textContent).toContain("Dieser Wert ist ungültig.");
    });
    expect(buttonByText(view, "Sonnig")).not.toBeNull();
    expect(buttonByText(view, "Zurücksetzen")).not.toBeNull();
  });

  it("triggers an event and shows its message", async () => {
    const view = await renderSettings();

    await act(async () => {
      buttonByText(view, "Rauchalarm")?.click();
    });

    expect(apiMocks.triggerEvent).toHaveBeenCalledWith("smoke_alarm", null);
    await waitFor(() => {
      expect(view.textContent).toContain("Rauchmelder in Küche hat ausgelöst.");
    });
    expect(view.textContent).toContain("Küche");
  });
});
