import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Automations } from "../../pages/Automations";
import * as api from "../../lib/api";
import type { AutomationOut } from "../../lib/types";

vi.mock("../../lib/liveState", () => ({
  useLiveState: () => ({
    state: {
      sim_time: "2026-06-15T08:00:00",
      weekday: "Montag",
      tick: 1,
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
      rooms: [
        {
          id: "kitchen",
          name: "Küche",
          sensors: {
            temperature: 22,
            humidity: 52,
            co2: 700,
            window_open: false,
            door_open: false,
            motion: false,
            smoke: false,
            water: false,
            power_w: 700,
          },
          devices: [],
          heating_active: true,
          light_on: false,
          open_messages: 0,
          status_text: "Alles normal",
        },
        {
          id: "living_room",
          name: "Wohnzimmer",
          sensors: {
            temperature: 21.5,
            humidity: 48,
            co2: 650,
            window_open: false,
            door_open: false,
            motion: false,
            smoke: false,
            water: false,
            power_w: 620,
          },
          devices: [],
          heating_active: true,
          light_on: false,
          open_messages: 0,
          status_text: "Alles normal",
        },
      ],
    },
    connected: true,
    error: null,
  }),
}));

vi.mock("../../lib/api", () => ({
  getAutomations: vi.fn(),
  createAutomation: vi.fn(),
  updateAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  getExecutions: vi.fn(),
}));

const RULE: AutomationOut = {
  id: "a1",
  name: "Fenster offen – Heizung aus",
  enabled: true,
  condition: { type: "window_open", room_id: "living_room", value: null, time: null },
  action: { type: "heating_off", room_id: "living_room", device_id: null, value: null },
  notify: false,
  created_at: "2026-06-15T07:00:00",
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderPage(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <MemoryRouter initialEntries={["/automations"]}>
        <Automations />
      </MemoryRouter>,
    );
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function findButton(view: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(view.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Button "${label}" not found`);
  }
  return button as HTMLButtonElement;
}

function findButtonByLabel(view: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(view.querySelectorAll("button")).find((item) =>
    item.getAttribute("aria-label")?.includes(label),
  );
  if (!button) {
    throw new Error(`Button with aria-label "${label}" not found`);
  }
  return button as HTMLButtonElement;
}

function findSelectByLabel(view: HTMLElement, label: string): HTMLSelectElement {
  const field = Array.from(view.querySelectorAll(".selectfield")).find((item) =>
    item.querySelector("label")?.textContent?.includes(label),
  );
  const select = field?.querySelector("select");
  if (!select) {
    throw new Error(`Select "${label}" not found`);
  }
  return select;
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  act(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.mocked(api.getAutomations).mockResolvedValue([]);
  vi.mocked(api.getExecutions).mockResolvedValue([]);
  vi.mocked(api.deleteAutomation).mockResolvedValue(undefined);
  vi.mocked(api.createAutomation).mockImplementation(async (input) => ({
    ...input,
    id: "created",
    created_at: "2026-06-15T08:00:00",
  }));
  vi.mocked(api.updateAutomation).mockImplementation(async (id, input) => ({
    ...input,
    id,
    created_at: "2026-06-15T07:00:00",
  }));
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

describe("automations screen", () => {
  it("creates a rule from the dialog and shows it in the list", async () => {
    const view = renderPage();
    await settle();

    act(() => {
      findButton(view, "Neue Automation").click();
    });
    await settle();

    await act(async () => {
      findButton(view, "Regel anlegen").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(api.createAutomation).toHaveBeenCalledTimes(1);
    expect(api.createAutomation).toHaveBeenCalledWith({
      name: "Fenster offen – Heizung aus",
      enabled: true,
      condition: { type: "window_open", room_id: "kitchen", value: null, time: null },
      action: { type: "heating_off", room_id: "kitchen", device_id: null, value: null },
      notify: true,
    });

    expect(view.textContent).toContain("Automationen · 1");
    expect(view.querySelectorAll("article.rule")).toHaveLength(1);
    expect(view.textContent).toContain("Fenster offen");
    expect(view.textContent).toContain("Heizung aus");
    expect(view.querySelector<HTMLButtonElement>("button.apill")?.getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("switches an existing rule off without removing it", async () => {
    vi.mocked(api.getAutomations).mockResolvedValue([RULE]);
    vi.mocked(api.getExecutions).mockResolvedValue([
      {
        id: "e1",
        automation_id: RULE.id,
        automation_name: RULE.name,
        sim_time: "2026-06-15T08:00:00",
        text: "Heizung in Wohnzimmer ausgeschaltet",
      },
    ]);
    vi.mocked(api.updateAutomation).mockResolvedValue({ ...RULE, enabled: false });

    const view = renderPage();
    await settle();

    expect(view.textContent).toContain("Zuletzt");
    expect(view.textContent).toContain("08:00");
    expect(view.textContent).toContain("Heizung in Wohnzimmer ausgeschaltet");

    const switchButton = view.querySelector<HTMLButtonElement>("button.apill");
    expect(switchButton?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      switchButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(api.updateAutomation).toHaveBeenCalledTimes(1);
    expect(api.updateAutomation).toHaveBeenCalledWith("a1", {
      name: RULE.name,
      enabled: false,
      condition: RULE.condition,
      action: RULE.action,
      notify: false,
    });
    expect(view.querySelectorAll("article.rule")).toHaveLength(1);
    const updated = view.querySelector<HTMLButtonElement>("button.apill");
    expect(updated?.getAttribute("aria-checked")).toBe("false");
    expect(updated?.textContent).toContain("inaktiv");
  });

  it("saves an edited rule and replaces the row in the list", async () => {
    vi.mocked(api.getAutomations).mockResolvedValue([RULE]);

    const view = renderPage();
    await settle();

    act(() => {
      findButtonByLabel(view, "bearbeiten").click();
    });
    await settle();

    changeSelect(findSelectByLabel(view, "Wenn"), "co2_above");

    await act(async () => {
      findButton(view, "Regel speichern").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(api.updateAutomation).toHaveBeenCalledTimes(1);
    expect(api.updateAutomation).toHaveBeenCalledWith("a1", {
      name: RULE.name,
      enabled: true,
      condition: { type: "co2_above", room_id: "living_room", value: 1000, time: null },
      action: RULE.action,
      notify: false,
    });
    expect(view.querySelectorAll("article.rule")).toHaveLength(1);
    expect(view.textContent).toContain("CO₂ über 1.000 ppm");
    expect(view.querySelector("article.rule")?.textContent).not.toContain("Fenster offen");
  });

  it("deletes a rule together with its executions", async () => {
    vi.mocked(api.getAutomations).mockResolvedValue([RULE]);
    vi.mocked(api.getExecutions).mockResolvedValue([
      {
        id: "e1",
        automation_id: RULE.id,
        automation_name: RULE.name,
        sim_time: "2026-06-15T08:00:00",
        text: "Heizung in Wohnzimmer ausgeschaltet",
      },
    ]);

    const view = renderPage();
    await settle();

    expect(view.querySelectorAll("article.rule")).toHaveLength(1);
    expect(view.textContent).toContain("Heizung in Wohnzimmer ausgeschaltet");

    await act(async () => {
      findButtonByLabel(view, "löschen").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(api.deleteAutomation).toHaveBeenCalledTimes(1);
    expect(api.deleteAutomation).toHaveBeenCalledWith("a1");
    expect(view.querySelectorAll("article.rule")).toHaveLength(0);
    expect(view.textContent).toContain("Automationen · 0");
    expect(view.textContent).not.toContain("Heizung in Wohnzimmer ausgeschaltet");
    expect(view.textContent).toContain("Noch keine Ausführung protokolliert.");
  });

  it("shows the German API error and keeps the rule enabled when toggling is rejected", async () => {
    vi.mocked(api.getAutomations).mockResolvedValue([RULE]);
    vi.mocked(api.updateAutomation).mockRejectedValue(
      new Error("Die Automation wurde nicht gefunden."),
    );

    const view = renderPage();
    await settle();

    await act(async () => {
      view.querySelector<HTMLButtonElement>("button.apill")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await settle();

    expect(view.querySelector(".error-box")?.textContent).toContain(
      "Die Automation wurde nicht gefunden.",
    );
    expect(view.querySelector<HTMLButtonElement>("button.apill")?.getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(view.querySelectorAll("article.rule")).toHaveLength(1);
  });
});
