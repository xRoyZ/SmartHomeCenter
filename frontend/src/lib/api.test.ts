import { describe, expect, it, vi } from "vitest";

import {
  API_BASE,
  ApiError,
  exportHistoryUrl,
  getDevice,
  getState,
  setDeviceState,
} from "./api";
import type { HouseState } from "./types";

const houseState: HouseState = {
  sim_time: "2026-06-15T08:05:00",
  weekday: "Montag",
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
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client", () => {
  it("loads the house snapshot including the seed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(houseState));
    vi.stubGlobal("fetch", fetchMock);

    const state = await getState();

    expect(state.seed).toBe(4711);
    expect(state.rooms).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/state`, undefined);
  });

  it("turns an error response into an ApiError with code and German message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: "unknown_device", message: "Das Gerät wurde nicht gefunden." } },
          404,
        ),
      ),
    );

    const failure = getDevice("missing");

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      code: "unknown_device",
      message: "Das Gerät wurde nicht gefunden.",
    });
  });

  it("sends a device command as JSON on the contract path", async () => {
    const detail = {
      device: {
        id: "living_room_light",
        room_id: "living_room",
        name: "Licht",
        type: "light",
        is_on: true,
        level: 100,
        target_temp: null,
        power_w: 40,
        state_text: "Licht an",
      },
      room_name: "Wohnzimmer",
      series: [],
      last_action: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(detail));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setDeviceState("living_room_light", { is_on: true });

    expect(result.room_name).toBe("Wohnzimmer");
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/api/devices/living_room_light/state`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ is_on: true }) }),
    );
  });

  it("builds the CSV export URL for the selected series", () => {
    const url = exportHistoryUrl({ room_id: "living room", metric: "all", window: "1h" });

    expect(url).toContain(`${API_BASE}/api/history/export?`);
    expect(url).toContain("room_id=living+room");
    expect(url).toContain("metric=all");
    expect(url).toContain("window=1h");
  });
});
