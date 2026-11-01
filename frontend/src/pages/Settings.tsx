/**
 * Settings screen.
 *
 * Composes the `world`, `events`, `jump` and `reset` regions of the approved
 * design. Every change is sent to the running simulation immediately; the
 * live state broadcasts the result back to this and every other client.
 */

import { useEffect, useState, type ReactElement } from "react";

import { EventTriggerPanel } from "../features/settings/EventTriggerPanel";
import { SimSettingsPanel } from "../features/settings/SimSettingsPanel";
import {
  ApiError,
  controlSimulation,
  getSettings,
  resetSimulation,
  updateSettings,
} from "../lib/api";
import { useLiveState } from "../lib/liveState";
import type { SettingsOut, SettingsUpdate } from "../lib/types";
import { Banner, Button, Checkbox, JumpLinks, PageHead, Toast, View } from "../ui";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Die Änderung konnte nicht an die Simulation übergeben werden.";
}

function ResetIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </g>
    </svg>
  );
}

export function Settings(): ReactElement {
  const { state } = useLiveState();
  const [settings, setSettings] = useState<SettingsOut | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetAutomations, setResetAutomations] = useState(false);
  const [resetThresholds, setResetThresholds] = useState(false);

  useEffect(() => {
    let disposed = false;

    getSettings()
      .then((loaded) => {
        if (!disposed) {
          setSettings(loaded);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setLoadError(errorMessage(error));
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }
    setSettings((current) =>
      current
        ? {
            ...current,
            weather: state.outdoor.weather,
            season: state.outdoor.season,
            speed: state.speed,
            seed: state.seed,
            paused: state.paused,
            sim_time: state.sim_time,
            weekday: state.weekday,
          }
        : current,
    );
  }, [state]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const paused = settings?.paused ?? state?.paused ?? false;

  async function applyUpdate(update: SettingsUpdate): Promise<void> {
    setActionError(null);
    setNotice(null);
    try {
      const next = await updateSettings(update);
      setSettings((current) => (current ? { ...current, ...next } : next));
      setNotice("Einstellungen gespeichert — die Simulation läuft damit weiter.");
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function togglePause(): Promise<void> {
    setActionError(null);
    setNotice(null);
    try {
      const next = await controlSimulation(paused ? "resume" : "pause");
      setSettings((current) => (current ? { ...current, ...next } : next));
      setNotice(paused ? "Simulation fortgesetzt." : "Simulation angehalten.");
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }

  async function reset(): Promise<void> {
    setActionError(null);
    setNotice(null);
    setResetting(true);
    try {
      const result = await resetSimulation({
        reset_automations: resetAutomations,
        reset_thresholds: resetThresholds,
      });
      setSettings(result.settings);
      setNotice("Zurücksetzen abgeschlossen — Haus, Geräte und simulierte Uhrzeit stehen wieder am Anfang.");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setResetting(false);
    }
  }

  return (
    <View>
      <PageHead
        title="Einstellungen"
        description="Die Welt, in der das Haus läuft: jede Änderung gilt sofort in der Simulation."
      />

      {loadError ? <Banner tone="error">{loadError}</Banner> : null}
      {actionError ? <Banner tone="error">{actionError}</Banner> : null}

      <SimSettingsPanel
        settings={settings}
        paused={paused}
        onUpdate={(update) => void applyUpdate(update)}
        onTogglePause={() => void togglePause()}
      />

      <EventTriggerPanel />

      <JumpLinks
        links={[{ to: "/thresholds", label: "Schwellwerte", hint: "Grenzen der Meldungen" }]}
      />

      <section className="reset-zone" data-od-id="reset" aria-label="Zurücksetzen">
        <h2 className="h2">Zurücksetzen</h2>
        <p>Stellt Haus, Geräte, simulierte Uhrzeit, Meldungen und Verlauf auf den Anfang zurück.</p>
        <Checkbox checked={resetAutomations} onChange={setResetAutomations}>
          Auch Automationen zurücksetzen
        </Checkbox>
        <Checkbox checked={resetThresholds} onChange={setResetThresholds}>
          Auch Schwellwerte zurücksetzen
        </Checkbox>
        <Button variant="secondary" onClick={() => void reset()} disabled={resetting}>
          <ResetIcon />
          {resetting ? "Wird zurückgesetzt …" : "Zurücksetzen"}
        </Button>
      </section>

      {notice ? <Toast message={notice} visible /> : null}
    </View>
  );
}
