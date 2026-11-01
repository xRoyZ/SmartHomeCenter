import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { Gallery } from "../dev/Gallery";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderGallery(): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  flushSync(() => {
    root?.render(
      <MemoryRouter initialEntries={["/dev/gallery"]}>
        <Gallery />
      </MemoryRouter>,
    );
  });
  return container;
}

afterEach(() => {
  if (root) {
    flushSync(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("UI kit gallery", () => {
  it("renders every kit component", () => {
    const view = renderGallery();

    const selectors = [
      ".btn-primary",
      ".btn-secondary",
      ".btn-sm",
      ".btn-square",
      ".btn-block",
      ".card",
      ".sev.hi",
      ".sev.mid",
      ".sev.lo",
      ".stat",
      ".reading-sm",
      ".reading-lg",
      ".reading.val",
      ".readout .bigfig .n",
      ".ledger .k",
      ".ledger .v.word",
      ".split",
      ".empty",
      ".sw .pill .knob",
      ".sw .pill .txt",
      "input[type='range']",
      "select.select",
      ".fieldgroup .field",
      ".check input[type='checkbox']",
      ".stepper .val",
      ".dlg",
      "dialog",
      ".jump a",
      ".pagehead h1",
      ".roomhead .nm.name",
      ".view .group",
      ".prose",
      ".note",
      ".error-box",
      ".toast.show",
      ".chartwrap",
      ".chart .area",
      ".chart .ln",
      ".chart .grid",
      ".chart .set",
      ".chartwrap .axis",
      ".chartwrap .legend i.dash",
      ".crumb",
      ".clock .day",
    ];

    for (const selector of selectors) {
      expect(view.querySelector(selector), `missing ${selector}`).not.toBeNull();
    }
  });

  it("puts the room name inside the level-1 heading", () => {
    const view = renderGallery();

    const heading = view.querySelector(".roomhead h1");
    expect(heading).not.toBeNull();
    expect(heading?.querySelector(".nm.name")?.textContent).toBe("Wohnzimmer");
    expect(heading?.textContent).toContain("Wohnzimmer");
  });

  it("labels the header as simulated and shows the seed", () => {
    const view = renderGallery();

    const header = view.querySelector(".simbar");
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("Simuliert");
    expect(header?.textContent).toContain("Seed 4711");

    const clock = header?.querySelector(".clock");
    expect(clock?.getAttribute("aria-label")).toContain("Simulierte Uhrzeit");
  });

  it("links every primary area from the tab bar", () => {
    const view = renderGallery();
    const tabBars = Array.from(view.querySelectorAll(".tabs"));
    const tabs = Array.from(tabBars[0]?.querySelectorAll(".tab") ?? []);

    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/",
      "/history",
      "/messages",
      "/automations",
      "/settings",
    ]);
    expect(tabBars[0]?.querySelector(".tab .count")?.textContent).toBe("2");
    expect(tabBars[1]?.querySelector(".tab[aria-current='page']")?.textContent).toContain(
      "Meldungen",
    );
  });

  it("lets the toggle change its state", () => {
    const view = renderGallery();
    const toggle = view.querySelector<HTMLButtonElement>(".sw[role='switch']");

    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    flushSync(() => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("aria-checked")).toBe("false");
  });
});
