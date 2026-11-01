import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getDevice, setDeviceState } from "../../lib/api";
import type {
  DeviceDetail as DeviceDetailData,
  DeviceState,
  HouseState,
} from "../../lib/types";
import { DeviceDetail } from "../../pages/DeviceDetail";
import { deviceStateWord } from "./DeviceControl";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const liveRef = vi.hoisted(() => ({
  current: null as HouseState | null,
}));

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => ({
    state: liveRef.current,
    connected: true,
    error: null,
  }),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    getDevice: vi.fn(),
    setDeviceState: vi.fn(),
  };
});

const getDeviceMock = vi.mocked(getDevice);
const setDeviceStateMock = vi.mocked(setDeviceState);

const heatingDevice: DeviceState = {
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

const houseState: HouseState = {
  sim_time: "2026-11-01T07:42:00",
  weekday: "Dienstag",
  tick: 7,
  paused: false,
  speed: 1,
  seed: 4711,
  outdoor: {
    temperature: 6.4,
    weather: "cloudy",
    season: "autumn",
    is_day: true,
    sunrise: "07:12",
    sunset: "17:38",
    solar_w: 0,
  },
  totals: { power_w: 700, solar_w: 0, grid_w: 700 },
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
        power_w: 700,
      },
      devices: [heatingDevice],
      heating_active: true,
      light_on: false,
      open_messages: 0,
      status_text: "Alles normal",
    },
  ],
};

const deviceDetail: DeviceDetailData = {
  device: heatingDevice,
  room_name: "Wohnzimmer",
  series: [
    {
      room_id: "living_room",
      metric: "temperature",
      window: "15m",
      unit: "°C",
      points: [
        { t: "2026-11-01T07:27:00", value: 20.8 },
        { t: "2026-11-01T07:34:00", value: 21.1 },
        { t: "2026-11-01T07:42:00", value: 21.4 },
      ],
    },
  ],
  last_action: {
    sim_time: "2026-11-01T07:38:00",
    text: "Soll auf 22,0 °C gesetzt",
  },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPage(deviceId = heatingDevice.id): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/devices/${deviceId}`]}>
        <Routes>
          <Route path="/devices/:deviceId" element={<DeviceDetail />} />
          <Route path="/" element={<p>Hausübersicht</p>} />
          <Route path="/rooms/:roomId" element={<p>Raumdetail</p>} />
        </Routes>
      </MemoryRouter>,
    );
  });

  return container;
}

beforeEach(() => {
  liveRef.current = houseState;
  getDeviceMock.mockReset();
  setDeviceStateMock.mockReset();
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
});

describe("device detail screen", () => {
  it("shows setpoint, heating load, measurement history and last action", async () => {
    getDeviceMock.mockResolvedValue(deviceDetail);

    const view = await renderPage();

    expect(getDeviceMock).toHaveBeenCalledWith("living_room_heating");
    expect(view.querySelector(".devblock .label")?.textContent).toContain(
      "Heizung Wohnzimmer",
    );
    expect(view.querySelector(".devblock .state-word")?.textContent).toBe("HEIZT");
    expect(view.querySelector("#soll-fig .n")?.textContent).toBe("22,0");
    expect(view.querySelector("#soll-fig .u")?.textContent).toContain("°C Soll");

    const minis = view.querySelector(".minis")?.textContent ?? "";
    expect(minis).toContain("21,4 °C");
    expect(minis).toContain("Leistung");
    expect(minis).toContain("700 W");

    const lastAction = view.querySelector(".delta")?.textContent ?? "";
    expect(lastAction).toContain("Soll auf 22,0 °C gesetzt");
    expect(view.querySelector(".delta time")?.textContent).toBe("07:38");

    expect(view.querySelector(".chart .ln")).not.toBeNull();
    expect(view.querySelector(".chartwrap .legend")?.textContent).toContain(
      "Solllinie",
    );
  });

  it("sends a changed setpoint and shows it immediately", async () => {
    getDeviceMock.mockResolvedValue(deviceDetail);
    setDeviceStateMock.mockResolvedValue({
      ...deviceDetail,
      device: { ...heatingDevice, target_temp: 22.5 },
      last_action: {
        sim_time: "2026-11-01T07:43:00",
        text: "Soll auf 22,5 °C gesetzt",
      },
    });

    const view = await renderPage();
    const plus = view.querySelector<HTMLButtonElement>(
      'button[aria-label="Solltemperatur erhöhen"]',
    );
    expect(plus).not.toBeNull();

    await act(async () => {
      plus?.click();
    });

    expect(setDeviceStateMock).toHaveBeenCalledWith("living_room_heating", {
      target_temp: 22.5,
    });
    expect(view.querySelector(".stepper .val")?.textContent).toContain("22,5");
    expect(view.querySelector("#soll-fig .n")?.textContent).toBe("22,5");
    expect(view.querySelector(".delta")?.textContent).toContain(
      "Soll auf 22,5 °C gesetzt",
    );
  });

  it("shows a rejected setpoint as the German ApiError message", async () => {
    getDeviceMock.mockResolvedValue(deviceDetail);
    setDeviceStateMock.mockRejectedValue(
      new ApiError(
        "validation_error",
        "Die Solltemperatur liegt außerhalb des erlaubten Bereichs.",
      ),
    );

    const view = await renderPage();
    const plus = view.querySelector<HTMLButtonElement>(
      'button[aria-label="Solltemperatur erhöhen"]',
    );

    await act(async () => {
      plus?.click();
    });

    expect(view.textContent).toContain(
      "Die Solltemperatur liegt außerhalb des erlaubten Bereichs.",
    );
    expect(view.querySelector("#soll-fig .n")?.textContent).toBe("22,0");
  });

  it("shows a German empty state with a way back for an unknown device", async () => {
    getDeviceMock.mockRejectedValue(
      new ApiError("unknown_device", "Das Gerät wurde nicht gefunden."),
    );

    const view = await renderPage("unknown");

    expect(view.textContent).toContain("Gerät nicht gefunden");
    expect(view.textContent).toContain("Das Gerät wurde nicht gefunden.");
    expect(view.querySelector('a[href="/"]')).not.toBeNull();
  });
});

describe("heating state word", () => {
  it("says HEIZT only while the thermostat draws power", () => {
    expect(deviceStateWord(heatingDevice)).toBe("HEIZT");
    expect(deviceStateWord({ ...heatingDevice, power_w: 0, level: 0 })).toBe("AUS");
    expect(deviceStateWord({ ...heatingDevice, is_on: false, power_w: 0 })).toBe("AUS");
  });
});
