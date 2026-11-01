/**
 * History screen.
 *
 * Reads the recorded series for the selected room, metric and simulated
 * window, keeps it fresh as the live simulation advances and offers the CSV
 * download for exactly that selection.
 */

import { useEffect, useState, type ReactElement } from "react";

import { ApiError, exportHistoryUrl, getHistory } from "../lib/api";
import { useLiveState } from "../lib/liveState";
import type { HistoryMetric, HistorySeries, HistoryWindow } from "../lib/types";
import { Button, Checkbox, Group, PageHead, View } from "../ui";
import { HistoryChart } from "../features/history/HistoryChart";
import { HistoryControls, type HistorySelection } from "../features/history/HistoryControls";

const GENERIC_ERROR = "Der Verlauf konnte nicht geladen werden.";

const METRIC_FILE_NAMES: Record<HistoryMetric, string> = {
  temperature: "temperatur",
  humidity: "luftfeuchte",
  co2: "co2",
  power: "verbrauch",
};

interface LoadedSeries {
  key: string;
  series: HistorySeries;
}

function roomSlug(name: string): string {
  const transliterated = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  const joined = Array.from(transliterated)
    .map((character) => (/[a-z0-9]/.test(character) ? character : "_"))
    .join("");
  return joined.split("_").filter(Boolean).join("_") || "raum";
}

function csvFileName(
  roomName: string,
  metric: HistoryMetric | "all",
  window: HistoryWindow,
): string {
  const slug = roomSlug(roomName);
  if (metric === "all") {
    return `${slug}_alle-messgroessen_${window}.csv`;
  }
  return `${slug}_${METRIC_FILE_NAMES[metric]}_${window}.csv`;
}

function downloadCsv(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
}

function DownloadIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10l5 5l5-5" />
      </g>
    </svg>
  );
}

export function History(): ReactElement {
  const { state } = useLiveState();
  const rooms = state?.rooms ?? [];
  const simTime = state?.sim_time ?? "";

  const [selection, setSelection] = useState<HistorySelection>({
    roomId: "",
    metric: "temperature",
    window: "1h",
  });
  const [loaded, setLoaded] = useState<LoadedSeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportAll, setExportAll] = useState(false);

  useEffect(() => {
    if (rooms.length === 0) {
      return;
    }
    setSelection((current) => {
      if (rooms.some((room) => room.id === current.roomId)) {
        return current;
      }
      return { ...current, roomId: rooms[0].id };
    });
  }, [rooms]);

  const handleSelectionChange = (patch: Partial<HistorySelection>): void => {
    setSelection((current) => ({ ...current, ...patch }));
  };

  const queryKey = `${selection.roomId}|${selection.metric}|${selection.window}`;

  useEffect(() => {
    if (!selection.roomId) {
      setLoaded(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    getHistory({
      room_id: selection.roomId,
      metric: selection.metric,
      window: selection.window,
    })
      .then((series) => {
        if (active) {
          setLoaded({ key: queryKey, series });
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setLoaded(null);
        setError(cause instanceof ApiError ? cause.message : GENERIC_ERROR);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [queryKey, selection.roomId, selection.metric, selection.window, simTime]);

  const series = loaded?.key === queryKey ? loaded.series : null;
  const room = rooms.find((entry) => entry.id === selection.roomId) ?? null;
  const roomName = room?.name ?? "";
  const exportUrl = selection.roomId
    ? exportHistoryUrl({
        room_id: selection.roomId,
        metric: exportAll ? "all" : selection.metric,
        window: selection.window,
      })
    : null;
  const fileName = roomName
    ? csvFileName(roomName, exportAll ? "all" : selection.metric, selection.window)
    : "";

  return (
    <View>
      <PageHead
        title="Verlauf"
        description="Wie sich das Haus entwickelt hat — aus der laufend mitgeschriebenen Zeitreihe der Simulation."
      />

      <HistoryControls
        rooms={rooms}
        selection={selection}
        onChange={handleSelectionChange}
      />

      <HistoryChart
        series={series}
        loading={loading}
        error={error}
        roomName={roomName}
        metric={selection.metric}
        window={selection.window}
        simTime={simTime}
      />

      <Group className="export" ariaLabel="CSV-Export">
        <Checkbox
          checked={exportAll}
          onChange={setExportAll}
          disabled={!selection.roomId}
        >
          Alle vier Messgrößen exportieren
        </Checkbox>
        <Button
          type="button"
          disabled={!exportUrl}
          aria-describedby={exportUrl ? undefined : "export-hint"}
          onClick={() => {
            if (exportUrl) {
              downloadCsv(exportUrl);
            }
          }}
        >
          <DownloadIcon />
          CSV herunterladen
        </Button>
        {exportUrl ? null : (
          <p className="fieldhint" id="export-hint">
            Der Export ist verfügbar, sobald ein Raum geladen ist.
          </p>
        )}
        <span className="fname" id="fname">
          {fileName || "–"}
        </span>
      </Group>
    </View>
  );
}
