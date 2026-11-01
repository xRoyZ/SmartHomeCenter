import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AutomationForm } from "./AutomationForm";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe("automation form layout", () => {
  it("keeps the condition and the action next to each other before the room choice", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root?.render(
        <AutomationForm
          open
          initial={null}
          rooms={[{ id: "living_room", name: "Wohnzimmer" }]}
          onClose={() => undefined}
          onSubmit={async () => undefined}
        />,
      );
    });

    const labels = Array.from(container.querySelectorAll("select")).map((select) =>
      select.getAttribute("aria-label"),
    );

    expect(labels).toEqual(["Wenn", "Dann", "Raum für Bedingung und Aktion"]);
  });
});
