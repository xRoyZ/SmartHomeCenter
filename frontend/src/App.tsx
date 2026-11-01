/**
 * Route table of the web interface.
 *
 * The development gallery is registered only in a development build; the
 * production bundle never mounts it.
 */

import { lazy, Suspense, type ReactElement } from "react";
import { Route, Routes } from "react-router-dom";

import { AppShell } from "./layout/AppShell";
import { Automations } from "./pages/Automations";
import { DeviceDetail } from "./pages/DeviceDetail";
import { History } from "./pages/History";
import { HouseOverview } from "./pages/HouseOverview";
import { Messages } from "./pages/Messages";
import { RoomDetail } from "./pages/RoomDetail";
import { Settings } from "./pages/Settings";
import { Thresholds } from "./pages/Thresholds";

const DevGallery = import.meta.env.DEV
  ? lazy(() => import("./dev/Gallery").then((module) => ({ default: module.Gallery })))
  : null;

export function App(): ReactElement {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HouseOverview />} />
        <Route path="/rooms/:roomId" element={<RoomDetail />} />
        <Route path="/devices/:deviceId" element={<DeviceDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/thresholds" element={<Thresholds />} />
        {DevGallery ? (
          <Route
            path="/dev/gallery"
            element={
              <Suspense fallback={null}>
                <DevGallery />
              </Suspense>
            }
          />
        ) : null}
      </Route>
    </Routes>
  );
}
