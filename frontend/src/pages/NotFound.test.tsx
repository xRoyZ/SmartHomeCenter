/**
 * Fallback screen: an address the app does not know renders the German hint
 * inside the application shell, and the eight approved routes keep their own
 * screens.
 */

import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import { NotFound } from "./NotFound";

vi.mock("../lib/liveState", () => ({
  LiveStateProvider: ({ children }: { children: ReactNode }) => children,
  useLiveState: () => ({ state: null, connected: false, error: null }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(ui: ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(ui);
  });

  return container;
}

beforeEach(() => {
  container = null;
  root = null;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
});

describe("not found screen", () => {
  it("renders the German hint and a way back to the overview", async () => {
    const view = await render(
      <MemoryRouter initialEntries={["/does-not-exist"]}>
        <NotFound />
      </MemoryRouter>,
    );

    expect(view.querySelector("h1")?.textContent).toBe("Seite nicht gefunden");
    expect(view.textContent).toContain("Diese Seite gibt es nicht.");

    const back = view.querySelector<HTMLAnchorElement>('a[href="/"]');
    expect(back).not.toBeNull();
    expect(back?.textContent).toContain("Zur Hausübersicht");
  });

  it("renders an unknown address inside the app frame", async () => {
    const view = await render(
      <MemoryRouter initialEntries={["/gibt-es-nicht"]}>
        <App />
      </MemoryRouter>,
    );

    expect(view.querySelector(".app")).not.toBeNull();
    expect(view.querySelector("nav[aria-label='Hauptnavigation']")).not.toBeNull();
    expect(view.querySelector(".simbar")).not.toBeNull();
    expect(view.querySelector("h1")?.textContent).toBe("Seite nicht gefunden");
    expect(view.textContent).toContain("Diese Seite gibt es nicht.");
  });
});
