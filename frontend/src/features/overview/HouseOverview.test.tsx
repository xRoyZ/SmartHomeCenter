import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceState, HouseState, RoomState, SettingsOut } from "../../lib/types";

const mockLive = vi.hoisted(() => ({
  state: null as HouseState | null,
}));

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => ({ state: mockLive.state, connected: true, error: null }),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    updateSettings: vi.fn(),
    controlSimulation: vi.fn(),
  };
});

import { ApiError, controlSimulation, updateSettings } from "../../lib/api";
import { HouseOverview } from "../../pages/HouseOverview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

interface RoomOptions {
  id: string;
  name: string;
  temperature: number;
  humidity: number;
  co2: number;
  windowOpen: boolean;
  heatingActive: boolean;
  lightOn: boolean;
  statusText: string;
}

function makeRoom(options: RoomOptions): RoomState {
  const heating: DeviceState = {
    id: `${options.id}_heating`,
    room_id: options.id,
    name: "Heizung",
    type: "heating",
    is_on: options.heatingActive,
    level: null,
    target_temp: 21,
    power_w: options.heatingActive ? 700 : 0,
    state_text: options.heatingActive ? "Heizung heizt" : "Heizung aus",
  };
  const light: DeviceState = {
    id: `${options.id}_light`,
    room_id: options.id,
    name: "Licht",
    type: "light",
    is_on: options.lightOn,
    level: options.lightOn ? 100 : 0,
    target_temp: null,
    power_w: options.lightOn ? 40 : 0,
    state_text: options.lightOn ? "Licht an" : "Licht aus",
  };

  return {
    id: options.id,
    name: options.name,
    sensors: {
      temperature: options.temperature,
      humidity: options.humidity,
      co2: options.co2,
      window_open: options.windowOpen,
      door_open: false,
      motion: false,
      smoke: false,
      water: false,
      power_w: (options.heatingActive ? 700 : 0) + (options.lightOn ? 40 : 0),
    },
    devices: [heating, light],
    heating_active: options.heatingActive,
    light_on: options.lightOn,
    open_messages: 0,
    status_text: options.statusText,
  };
}

function makeState(rooms: RoomState[]): HouseState {
  return {
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
      solar_w: 420,
    },
    totals: { power_w: 3260, solar_w: 420, grid_w: 2840 },
    open_messages: 2,
    rooms,
  };
}

function renderOverview(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <MemoryRouter initialEntries={["/"]}>
        <HouseOverview />
      </MemoryRouter>,
    );
  });
  return container;
}

function cardOf(view: HTMLElement, roomId: string): HTMLElement {
  const card = view.querySelector<HTMLElement>(`[data-od-id="room-${roomId}"]`);
  expect(card, `missing room card ${roomId}`).not.toBeNull();
  return card as HTMLElement;
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

beforeEach(() => {
  mockLive.state = null;
  vi.mocked(updateSettings).mockReset();
  vi.mocked(controlSimulation).mockReset();
  vi.mocked(updateSettings).mockResolvedValue({} as SettingsOut);
  vi.mocked(controlSimulation).mockResolvedValue({} as SettingsOut);
});

describe("house overview rooms", () => {
  it("shows a cold room with an open window in plain German", () => {
    mockLive.state = makeState([
      makeRoom({
        id: "bedroom",
        name: "Schlafzimmer",
        temperature: 17.8,
        humidity: 46,
        co2: 560,
        windowOpen: true,
        heatingActive: false,
        lightOn: false,
        statusText: "Fenster offen",
      }),
    ]);

    const view = renderOverview();
    const card = cardOf(view, "schlafzimmer");

    expect(card.getAttribute("href")).toBe("/rooms/bedroom");
    expect(card.textContent).toContain("Schlafzimmer");
    expect(card.textContent).toContain("17,8");
    expect(card.textContent).toContain("Fenster auf");
    expect(card.textContent).toContain("Heizung aus");
    expect(card.textContent).toContain("Fenster offen");
    expect(card.textContent).toContain("Zu kalt");
    expect(card.getAttribute("aria-label")).toContain("Fenster offen");
  });

  it("shows a warm room with its running heating and light", () => {
    mockLive.state = makeState([
      makeRoom({
        id: "living_room",
        name: "Wohnzimmer",
        temperature: 23.4,
        humidity: 48,
        co2: 620,
        windowOpen: false,
        heatingActive: true,
        lightOn: true,
        statusText: "Alles normal",
      }),
    ]);

    const view = renderOverview();
    const card = cardOf(view, "wohnzimmer");

    expect(card.getAttribute("href")).toBe("/rooms/living_room");
    expect(card.textContent).toContain("Wohnzimmer");
    expect(card.textContent).toContain("23,4");
    expect(card.textContent).toContain("Fenster zu");
    expect(card.textContent).toContain("Heizt");
    expect(card.textContent).toContain("Licht an");
    expect(card.textContent).toContain("Alles normal");
  });

  it("renders the live energy and weather values", () => {
    mockLive.state = makeState([]);

    const view = renderOverview();

    expect(view.textContent).toContain("Netzbezug");
    expect(view.textContent).toContain("2,84");
    expect(view.textContent).toContain("Außen 6,4 °C");
    expect(view.textContent).toContain("Bewölkt");
    expect(view.textContent).toContain("Winter");
    expect(view.textContent).toContain("Sonnenaufgang 07:12");
    expect(view.textContent).toContain("Sonnenuntergang 17:38");
  });
});

describe("house overview energy balance", () => {
  it("names the feed-in when the solar yield exceeds the consumption", () => {
    const state = makeState([]);
    state.totals = { power_w: 90, solar_w: 2780, grid_w: -2690 };
    mockLive.state = state;

    const view = renderOverview();
    const energy = view.querySelector(".energy");

    expect(energy?.querySelector(".label")?.textContent).toBe("Einspeisung");
    expect(energy?.querySelector("[data-net]")?.textContent).toBe("2,69");
  });
});

describe("house overview simulation controls", () => {
  it("sends the chosen speed to the settings endpoint", async () => {
    mockLive.state = makeState([]);
    const view = renderOverview();
    const speedButton = Array.from(
      view.querySelectorAll<HTMLButtonElement>(".speed .chipbtn"),
    ).find((button) => button.textContent === "10×");

    expect(speedButton).not.toBeUndefined();
    await act(async () => {
      speedButton?.click();
      await Promise.resolve();
    });

    expect(updateSettings).toHaveBeenCalledWith({ speed: 10 });
  });

  it("pauses the running simulation", async () => {
    mockLive.state = makeState([]);
    const view = renderOverview();
    const pause = Array.from(view.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Pause"),
    );

    expect(pause).not.toBeUndefined();
    await act(async () => {
      pause?.click();
      await Promise.resolve();
    });

    expect(controlSimulation).toHaveBeenCalledWith("pause");
  });

  it("shows a rejected change as the German error message and keeps the page content", async () => {
    mockLive.state = makeState([
      makeRoom({
        id: "living_room",
        name: "Wohnzimmer",
        temperature: 23.4,
        humidity: 48,
        co2: 620,
        windowOpen: false,
        heatingActive: false,
        lightOn: true,
        statusText: "Alles normal",
      }),
    ]);
    vi.mocked(updateSettings).mockRejectedValueOnce(
      new ApiError("validation_error", "Die Geschwindigkeit ist ungültig."),
    );
    const view = renderOverview();
    const speedButton = Array.from(
      view.querySelectorAll<HTMLButtonElement>(".speed .chipbtn"),
    ).find((button) => button.textContent === "300×");

    await act(async () => {
      speedButton?.click();
      await Promise.resolve();
    });

    expect(view.textContent).toContain("Die Geschwindigkeit ist ungültig.");
    expect(view.textContent).toContain("Wohnzimmer");
    expect(view.querySelector(".overview-error [role='alert']")).not.toBeNull();
  });
});
