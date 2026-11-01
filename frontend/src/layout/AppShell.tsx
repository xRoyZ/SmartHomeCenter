/**
 * Layout frame of the application.
 *
 * The header slot receives `Header`, the content region renders the active
 * route and the navigation slot receives `Nav`.
 */

import type { ReactElement } from "react";
import { Outlet } from "react-router-dom";

import { useLiveState } from "../lib/liveState";
import { Header } from "./Header";
import { Nav } from "./Nav";

export function AppShell(): ReactElement {
  const { state, connected, error } = useLiveState();

  return (
    <div className="app">
      <Header
        simTime={state?.sim_time ?? ""}
        weekday={state?.weekday ?? ""}
        speed={state?.speed ?? 1}
        paused={state?.paused ?? false}
        connected={connected}
        seed={state?.seed ?? 0}
      />
      <main>
        {error ? (
          <p className="offline-note" role="status">
            {error}
          </p>
        ) : null}
        <Outlet />
      </main>
      <Nav />
    </div>
  );
}
