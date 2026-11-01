import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Messages } from "../../pages/Messages";
import { ackMessage, getMessages } from "../../lib/api";
import type { MessageOut } from "../../lib/types";

const live = vi.hoisted(() => ({
  value: { state: { tick: 7 } as { tick: number } | null, connected: true, error: null },
}));

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => live.value,
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getMessages: vi.fn(), ackMessage: vi.fn() };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const openMessage: MessageOut = {
  id: "open-1",
  kind: "smoke",
  severity: "critical",
  room_id: "kitchen",
  room_name: "Küche",
  text: "Rauchmelder in Küche hat ausgelöst.",
  created_at: "2026-06-15T07:31:00",
  acknowledged_at: null,
};

const doneMessage: MessageOut = { ...openMessage, acknowledged_at: "2026-06-15T07:40:00" };

interface PendingLoad {
  status: string;
  resolve: (messages: MessageOut[]) => void;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let pendingLoads: PendingLoad[];
let deferLoads: boolean;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

async function renderMessages(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Messages />);
  });
  await settle();
  return container;
}

async function nextTick(): Promise<void> {
  live.value = { ...live.value, state: { tick: (live.value.state?.tick ?? 0) + 1 } };
  await act(async () => {
    root?.render(<Messages />);
  });
  await settle();
}

function resolvePending(status: string, messages: MessageOut[]): void {
  const pending = pendingLoads.filter((load) => load.status === status);
  for (const load of pending) {
    load.resolve(messages);
  }
}

beforeEach(() => {
  live.value = { state: { tick: 7 }, connected: true, error: null };
  pendingLoads = [];
  deferLoads = false;
  vi.mocked(getMessages).mockReset();
  vi.mocked(getMessages).mockImplementation((status) => {
    if (deferLoads) {
      return new Promise<MessageOut[]>((resolve) => {
        pendingLoads.push({ status: status ?? "open", resolve });
      });
    }
    return Promise.resolve(status === "open" ? [openMessage] : []);
  });
  vi.mocked(ackMessage).mockReset();
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

describe("message acknowledgement flow", () => {
  it("keeps an acknowledged message out of the open group when a reload started earlier", async () => {
    vi.mocked(ackMessage).mockResolvedValue(doneMessage);
    const view = await renderMessages();
    expect(view.querySelectorAll("#list-open > li.mrow")).toHaveLength(1);

    deferLoads = true;
    await nextTick();
    pendingLoads = [];

    const button = view.querySelector<HTMLButtonElement>("#list-open .act");
    await act(async () => {
      button?.click();
    });
    await settle();

    expect(ackMessage).toHaveBeenCalledWith("open-1");
    expect(view.querySelectorAll("#list-open > li.mrow")).toHaveLength(0);
    expect(view.querySelectorAll("#list-done > li.mrow")).toHaveLength(1);

    deferLoads = false;
    resolvePending("open", [openMessage]);
    resolvePending("acknowledged", []);
    await settle();
    await settle();

    expect(view.querySelectorAll("#list-open > li.mrow")).toHaveLength(0);
    expect(view.querySelector("#list-done")?.textContent).toContain("bestätigt 07:40");
    expect(view.querySelector("#count-open")?.textContent).toBe("0");
  });
});
