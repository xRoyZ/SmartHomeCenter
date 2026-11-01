import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HouseState } from "./types";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    readonly code = "internal_error";
  }
  return {
    ApiError,
    getState: vi.fn(),
    websocketUrl: vi.fn(() => "ws://api.test/ws"),
  };
});

vi.mock("./api", () => api);

import { LiveStateProvider, useLiveState } from "./liveState";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface FakeSocket {
  url: string;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  close: () => void;
}

let sockets: FakeSocket[] = [];

class MockWebSocket implements FakeSocket {
  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  close(): void {
    // The provider detaches the handlers before closing, so nothing fires.
  }
}

function snapshot(simTime: string, tick: number): HouseState {
  return {
    sim_time: simTime,
    weekday: "Montag",
    tick,
    paused: false,
    speed: 1,
    seed: 42,
    outdoor: {
      temperature: 22,
      weather: "sunny",
      season: "summer",
      is_day: true,
      sunrise: "06:00",
      sunset: "21:00",
      solar_w: 3000,
    },
    totals: { power_w: 1200, solar_w: 3000, grid_w: -1800 },
    open_messages: 0,
    rooms: [],
  };
}

function frame(state: HouseState): { data: string } {
  return { data: JSON.stringify({ type: "snapshot", payload: state }) };
}

function Probe(): ReactElement {
  const { state, connected } = useLiveState();
  return (
    <div>
      <span data-testid="time">{state?.sim_time ?? "keine"}</span>
      <span data-testid="connected">{String(connected)}</span>
    </div>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderProvider(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <LiveStateProvider>
        <Probe />
      </LiveStateProvider>,
    );
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function timeOf(view: HTMLElement): string {
  return view.querySelector<HTMLElement>("[data-testid='time']")?.textContent ?? "";
}

beforeEach(() => {
  sockets = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  api.getState.mockReset();
  api.websocketUrl.mockReset();
  api.websocketUrl.mockReturnValue("ws://api.test/ws");
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  vi.useRealTimers();
});

describe("live house state", () => {
  it("shows the loaded snapshot and then every frame the server pushes", async () => {
    api.getState.mockResolvedValue(snapshot("2026-06-15T08:00:00", 0));
    const view = renderProvider();
    await settle();

    expect(timeOf(view)).toBe("2026-06-15T08:00:00");

    const socket = sockets[0];
    expect(socket).toBeDefined();
    act(() => {
      socket.onopen?.();
      socket.onmessage?.(frame(snapshot("2026-06-15T08:01:00", 1)));
    });

    expect(timeOf(view)).toBe("2026-06-15T08:01:00");
    expect(view.querySelector<HTMLElement>("[data-testid='connected']")?.textContent).toBe("true");
  });

  it("keeps a pushed frame when an older HTTP snapshot arrives afterwards", async () => {
    let resolveLoad: ((value: HouseState) => void) | null = null;
    api.getState.mockReturnValue(
      new Promise<HouseState>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const view = renderProvider();
    const socket = sockets[0];
    act(() => {
      socket.onopen?.();
      socket.onmessage?.(frame(snapshot("2026-06-15T08:02:00", 2)));
    });
    expect(timeOf(view)).toBe("2026-06-15T08:02:00");

    await act(async () => {
      resolveLoad?.(snapshot("2026-06-15T08:00:00", 0));
      await Promise.resolve();
    });

    expect(timeOf(view)).toBe("2026-06-15T08:02:00");
  });

  it("shows the same pushed frame in two independent clients", async () => {
    api.getState.mockResolvedValue(snapshot("2026-06-15T08:00:00", 0));
    const clients = [0, 1].map(() => {
      const clientContainer = document.createElement("div");
      document.body.appendChild(clientContainer);
      const clientRoot = createRoot(clientContainer);
      act(() => {
        clientRoot.render(
          <LiveStateProvider>
            <Probe />
          </LiveStateProvider>,
        );
      });
      return { clientContainer, clientRoot };
    });
    await settle();

    expect(sockets).toHaveLength(2);
    const shared = snapshot("2026-06-15T08:05:00", 5);
    act(() => {
      for (const socket of sockets) {
        socket.onopen?.();
        socket.onmessage?.(frame(shared));
      }
    });

    const times = clients.map((client) =>
      client.clientContainer.querySelector<HTMLElement>("[data-testid='time']")?.textContent,
    );
    expect(times).toEqual(["2026-06-15T08:05:00", "2026-06-15T08:05:00"]);

    for (const client of clients) {
      act(() => client.clientRoot.unmount());
      client.clientContainer.remove();
    }
  });

  it("derives the socket address from the page origin when the API base is relative", async () => {
    api.getState.mockResolvedValue(snapshot("2026-06-15T08:00:00", 0));
    api.websocketUrl.mockReturnValue("/ws");

    renderProvider();
    await settle();

    const expected = `${window.location.origin.replace(/^http/i, "ws")}/ws`;
    expect(sockets[0]?.url).toBe(expected);
  });
});
