import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api";
import type {
  DeviceState,
  HistorySeries,
  HouseState,
  RoomDetail as RoomDetailPayload,
  RoomState,
} from "../../lib/types";
import { RoomDetail } from "../../pages/RoomDetail";

const mocks = vi.hoisted(() => ({
  getRoom: vi.fn(),
  getHistory: vi.fn(),
  setDeviceState: vi.fn(),
  liveState: { current: null as HouseState | null },
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    getRoom: mocks.getRoom,
    getHistory: mocks.getHistory,
    setDeviceState: mocks.setDeviceState,
  };
});

vi.mock("../../lib/liveState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/liveState")>();
  return {
    ...actual,
    useLiveState: () => ({ state: mocks.liveState.current, connected: true, error: null }),
  };
});

const heating: DeviceState = {
  id: "living_room_heating",
  room_id: "living_room",
  name: "Heizung",
  type: "heating",
  is_on: true,
  level: null,
  target_temp: 22,
  power_w: 700,
  state_text: "Heizung heizt",
};

const light: DeviceState = {
  id: "living_room_light",
  room_id: "living_room",
  name: "Licht",
  type: "light",
  is_on: true,
  level: 70,
  target_temp: null,
  power_w: 28,
  state_text: "Licht an",
};

const shutter: DeviceState = {
  id: "living_room_shutter",
  room_id: "living_room",
  name: "Rollladen",
  type: "shutter",
  is_on: false,
  level: 100,
  target_temp: null,
  power_w: 0,
  state_text: "Rollladen 100 % offen",
};

const plug: DeviceState = {
  id: "living_room_tv",
  room_id: "living_room",
  name: "Steckdose",
  type: "plug",
  is_on: false,
  level: null,
  target_temp: null,
  power_w: 0,
  state_text: "Steckdose aus",
};

const room: RoomState = {
  id: "living_room",
  name: "Wohnzimmer",
  sensors: {
    temperature: 21.4,
    humidity: 46,
    co2: 780,
    window_open: true,
    door_open: false,
    motion: true,
    smoke: false,
    water: false,
    power_w: 340,
  },
  devices: [heating, light, shutter, plug],
  heating_active: true,
  light_on: true,
  open_messages: 0,
  status_text: "Fenster offen, Heizung läuft",
};

const house: HouseState = {
  sim_time: "2026-06-15T08:05:00",
  weekday: "Montag",
  tick: 5,
  paused: false,
  speed: 60,
  seed: 4711,
  outdoor: {
    temperature: 18,
    weather: "sunny",
    season: "summer",
    is_day: true,
    sunrise: "06:00",
    sunset: "21:00",
    solar_w: 1200,
  },
  totals: { power_w: 340, solar_w: 1200, grid_w: 0 },
  open_messages: 0,
  rooms: [room],
};

const detail: RoomDetailPayload = { room, devices: room.devices };

const series: HistorySeries = {
  room_id: "living_room",
  metric: "temperature",
  window: "1h",
  unit: "°C",
  points: [
    { t: "2026-06-15T07:05:00", value: 20.3 },
    { t: "2026-06-15T07:35:00", value: 20.8 },
    { t: "2026-06-15T08:05:00", value: 21.4 },
  ],
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderRoom(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/rooms/living_room"]}>
        <Routes>
          <Route path="/rooms/:roomId" element={<RoomDetail />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

function shutterSlider(): HTMLInputElement {
  const slider = document.querySelector<HTMLInputElement>(
    "input[aria-label='Rollladen in Prozent geschlossen']",
  );
  if (!slider) {
    throw new Error("shutter slider is missing");
  }
  return slider;
}

function moveSlider(slider: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) {
    throw new Error("input value setter is missing");
  }
  setter.call(slider, value);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.liveState.current = house;
  mocks.getRoom.mockResolvedValue(detail);
  mocks.getHistory.mockResolvedValue(series);
  mocks.setDeviceState.mockResolvedValue(detail);
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe("room detail", () => {
  it("sends a shutter movement as the simulation's open percentage", async () => {
    await renderRoom();

    const slider = shutterSlider();
    await act(async () => {
      moveSlider(slider, "80");
    });

    expect(mocks.setDeviceState).toHaveBeenCalledWith("living_room_shutter", { level: 20 });
    expect(container?.textContent).toContain("80 %");
  });

  it("shows a rejected command as the German server message and keeps the page live", async () => {
    mocks.setDeviceState.mockRejectedValueOnce(
      new ApiError("validation_error", "Der Rollladenwert ist ungültig."),
    );
    await renderRoom();

    const slider = shutterSlider();
    await act(async () => {
      moveSlider(slider, "80");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container?.textContent).toContain("Der Rollladenwert ist ungültig.");
    expect(container?.textContent).toContain("Luftfeuchte");
    expect(container?.textContent).toContain("21,4");
  });
});
