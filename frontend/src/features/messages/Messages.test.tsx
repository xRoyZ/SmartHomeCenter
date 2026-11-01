import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Messages } from "../../pages/Messages";
import { ApiError, ackMessage, getMessages } from "../../lib/api";
import type { MessageOut } from "../../lib/types";

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => ({
    state: { tick: 7 },
    connected: true,
    error: null,
  }),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return { ...actual, getMessages: vi.fn(), ackMessage: vi.fn() };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function message(overrides: Partial<MessageOut> = {}): MessageOut {
  return {
    id: "message-base",
    kind: "room_cold",
    severity: "warning",
    room_id: "living_room",
    room_name: "Wohnzimmer",
    text: "Raum zu kalt 17,8 °C",
    created_at: "2026-06-15T06:12:00",
    acknowledged_at: null,
    ...overrides,
  };
}

const openMessage = message({
  id: "open-1",
  kind: "co2_high",
  severity: "critical",
  room_id: "bath",
  room_name: "Bad",
  text: "Hohe Luftfeuchte 78 %",
  created_at: "2026-06-15T07:31:00",
});

const doneMessage = message({
  id: "done-1",
  acknowledged_at: "2026-06-15T06:40:00",
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

beforeEach(() => {
  vi.mocked(getMessages).mockReset();
  vi.mocked(getMessages).mockImplementation((status) => {
    if (status === "open") {
      return Promise.resolve([openMessage]);
    }
    if (status === "acknowledged") {
      return Promise.resolve([doneMessage]);
    }
    return Promise.resolve([openMessage, doneMessage]);
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

describe("messages screen", () => {
  it("loads the open and the acknowledged list through the status filter", async () => {
    const view = await renderMessages();

    expect(getMessages).toHaveBeenCalledWith("open");
    expect(getMessages).toHaveBeenCalledWith("acknowledged");

    const openRows = view.querySelectorAll("#list-open .mrow");
    expect(openRows).toHaveLength(1);
    expect(view.querySelector("#list-open")?.textContent).toContain("Hohe Luftfeuchte 78 %");
    expect(view.querySelector("#list-open")?.textContent).toContain("Bad");
    expect(view.querySelector("#list-open")?.textContent).toContain("07:31");
    expect(view.querySelector("#list-open .sev")?.textContent).toBe("hoch");
    expect(view.querySelector("#count-open")?.textContent).toBe("1");

    const doneRows = view.querySelectorAll("#list-done .mrow");
    expect(doneRows).toHaveLength(1);
    expect(view.querySelector("#list-done")?.textContent).toContain("bestätigt 06:40");
    expect(view.querySelector("#count-done")?.textContent).toBe("1");
  });

  it("acknowledges a message and moves it to the confirmed list without a reload", async () => {
    vi.mocked(ackMessage).mockResolvedValue({
      ...openMessage,
      acknowledged_at: "2026-06-15T07:40:00",
    });
    const view = await renderMessages();
    const button = view.querySelector<HTMLButtonElement>("#list-open .act");
    expect(button?.textContent).toBe("Bestätigen");

    await act(async () => {
      button?.click();
    });
    await settle();

    expect(ackMessage).toHaveBeenCalledWith("open-1");
    expect(view.querySelectorAll("#list-open .mrow")).toHaveLength(0);
    expect(view.querySelectorAll("#list-done .mrow")).toHaveLength(2);
    expect(view.querySelector("#list-done")?.textContent).toContain("bestätigt 07:40");
    expect(view.querySelector("#count-open")?.textContent).toBe("0");
    expect(view.querySelector("#count-done")?.textContent).toBe("2");
    expect(view.querySelector(".group-open .empty")?.textContent).toBe(
      "Alles bestätigt — das Haus hat gerade nichts zu melden.",
    );
  });

  it("shows the German empty state when nothing is open", async () => {
    vi.mocked(getMessages).mockResolvedValue([]);

    const view = await renderMessages();

    expect(view.querySelector("#list-open .mrow")).toBeNull();
    expect(view.querySelector(".group-open .empty")?.textContent).toBe(
      "Alles bestätigt — das Haus hat gerade nichts zu melden.",
    );
    expect(view.querySelector(".group-done .empty")?.textContent).toBe("Noch nichts bestätigt.");
  });

  it("shows the ApiError message and keeps both lists when acknowledging fails", async () => {
    vi.mocked(ackMessage).mockRejectedValue(
      new ApiError("unknown_message", "Die Meldung wurde nicht gefunden."),
    );
    const view = await renderMessages();

    const button = view.querySelector<HTMLButtonElement>("#list-open .act");
    await act(async () => {
      button?.click();
    });
    await settle();

    expect(view.querySelector(".error-box")?.textContent).toContain(
      "Die Meldung wurde nicht gefunden.",
    );
    expect(view.querySelectorAll("#list-open .mrow")).toHaveLength(1);
    expect(view.querySelectorAll("#list-done .mrow")).toHaveLength(1);
    expect(view.querySelector("#count-open")?.textContent).toBe("1");
  });
});
