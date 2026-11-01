import { useEffect, useState, type ReactElement } from "react";

import {
  AutomationForm,
  describeAction,
  describeCondition,
  type RoomOption,
} from "../features/automations/AutomationForm";
import { ExecutionLog } from "../features/automations/ExecutionLog";
import {
  createAutomation,
  deleteAutomation,
  getAutomations,
  getExecutions,
  updateAutomation,
} from "../lib/api";
import { formatSimTime } from "../lib/format";
import { useLiveState } from "../lib/liveState";
import type { AutomationInput, AutomationOut, ExecutionOut } from "../lib/types";
import { Banner, Button, EmptyState, Group, IconButton, PageHead, View } from "../ui";

const ACTION_ROW_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: "var(--s2)",
} as const;

const FALLBACK_LOAD_ERROR = "Die Automationen konnten nicht geladen werden.";
const FALLBACK_LOG_ERROR = "Das Ausführungsprotokoll konnte nicht geladen werden.";
const FALLBACK_SAVE_ERROR = "Die Regel konnte nicht gespeichert werden.";
const FALLBACK_TOGGLE_ERROR = "Die Regel konnte nicht geändert werden.";
const FALLBACK_DELETE_ERROR = "Die Regel konnte nicht gelöscht werden.";

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return fallback;
}

function toInput(rule: AutomationOut, enabled: boolean = rule.enabled): AutomationInput {
  return {
    name: rule.name,
    enabled,
    condition: { ...rule.condition },
    action: { ...rule.action },
    notify: rule.notify,
  };
}

function latestExecution(entries: ExecutionOut[] | undefined): ExecutionOut | null {
  if (!entries || entries.length === 0) {
    return null;
  }
  return entries.reduce((latest, entry) => (entry.sim_time > latest.sim_time ? entry : latest));
}

function PlusIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14m-7-7v14"
      />
    </svg>
  );
}

function EditIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </g>
    </svg>
  );
}

function TrashIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M10 11v6m4-6v6" />
      </g>
    </svg>
  );
}

export function Automations(): ReactElement {
  const { state } = useLiveState();
  const [automations, setAutomations] = useState<AutomationOut[]>([]);
  const [executions, setExecutions] = useState<Record<string, ExecutionOut[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationOut | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rooms: RoomOption[] = (state?.rooms ?? []).map((room) => ({
    id: room.id,
    name: room.name,
  }));
  const automationKey = automations.map((rule) => rule.id).join(",");
  const tick = state?.tick ?? 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAutomations()
      .then((rules) => {
        if (!cancelled) {
          setAutomations(rules);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(messageFor(error, FALLBACK_LOAD_ERROR));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (automationKey === "") {
      setExecutions({});
      return;
    }
    let cancelled = false;
    const ids = automationKey.split(",");
    Promise.all(ids.map(async (id) => [id, await getExecutions(id)] as const))
      .then((entries) => {
        if (!cancelled) {
          setExecutions(Object.fromEntries(entries));
          setLogError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLogError(messageFor(error, FALLBACK_LOG_ERROR));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [automationKey, tick]);

  const openCreate = (): void => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (rule: AutomationOut): void => {
    setEditing(rule);
    setFormOpen(true);
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditing(null);
  };

  const submitForm = async (input: AutomationInput): Promise<void> => {
    setActionError(null);
    if (editing) {
      try {
        const updated = await updateAutomation(editing.id, input);
        setAutomations((current) =>
          current.map((rule) => (rule.id === updated.id ? updated : rule)),
        );
      } catch (error) {
        throw new Error(messageFor(error, FALLBACK_SAVE_ERROR));
      }
      return;
    }
    try {
      const created = await createAutomation(input);
      setAutomations((current) => [...current, created]);
    } catch (error) {
      throw new Error(messageFor(error, FALLBACK_SAVE_ERROR));
    }
  };

  const toggleRule = async (rule: AutomationOut): Promise<void> => {
    setBusyId(rule.id);
    setActionError(null);
    try {
      const updated = await updateAutomation(rule.id, toInput(rule, !rule.enabled));
      setAutomations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setActionError(messageFor(error, FALLBACK_TOGGLE_ERROR));
    } finally {
      setBusyId(null);
    }
  };

  const removeRule = async (rule: AutomationOut): Promise<void> => {
    setBusyId(rule.id);
    setActionError(null);
    try {
      await deleteAutomation(rule.id);
      setAutomations((current) => current.filter((item) => item.id !== rule.id));
      setExecutions((current) => {
        const next = { ...current };
        delete next[rule.id];
        return next;
      });
    } catch (error) {
      setActionError(messageFor(error, FALLBACK_DELETE_ERROR));
    } finally {
      setBusyId(null);
    }
  };

  const allExecutions = Object.values(executions)
    .flat()
    .sort((left, right) => right.sim_time.localeCompare(left.sim_time));

  const pageError = actionError ?? loadError ?? logError;

  return (
    <>
      <View>
        <PageHead
          title="Regeln"
          description="Wenn im Haus etwas eintritt, tut das Haus von selbst, was Sie festgelegt haben."
        />

        {pageError ? <Banner tone="error">{pageError}</Banner> : null}

        <Group title={`Automationen · ${automations.length}`} ariaLabel="Automationen">
          <div id="rules" data-od-id="rules">
            {loading ? <EmptyState>Automationen werden geladen…</EmptyState> : null}
            {!loading && !loadError && automations.length === 0 ? (
              <EmptyState>
                Noch keine Automation angelegt. Legen Sie unten die erste Regel an.
              </EmptyState>
            ) : null}
            {automations.map((rule) => {
              const last = latestExecution(executions[rule.id]);
              const conditionText = describeCondition(rule.condition);
              const actionText = describeAction(rule.action);
              return (
                <div key={rule.id}>
                  <header
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "var(--s2)",
                      paddingTop: "var(--s3)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--disp)",
                        fontWeight: "var(--w-disp)",
                        fontSize: "var(--fs-17)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {rule.name}
                    </span>
                  </header>
                  <article className="rule">
                    <div className="cols">
                      <div className="col">
                        <span className="label">Wenn</span>
                        <p>{conditionText}</p>
                      </div>
                      <div className="col">
                        <span className="label">Dann</span>
                        <p>
                          {actionText}
                          {rule.notify ? ", mit Meldung" : ""}
                        </p>
                      </div>
                    </div>
                    <footer>
                      <span className="last">
                        {last ? (
                          <>
                            Zuletzt{" "}
                            <time
                              dateTime={last.sim_time}
                              aria-label={`Simulierte Uhrzeit ${formatSimTime(last.sim_time)}`}
                            >
                              {formatSimTime(last.sim_time)}
                            </time>
                          </>
                        ) : (
                          "Noch nie ausgeführt"
                        )}
                      </span>
                      <div style={ACTION_ROW_STYLE}>
                        <IconButton
                          label={`Regel „${rule.name}“ bearbeiten`}
                          onClick={() => openEdit(rule)}
                          disabled={busyId === rule.id}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          label={`Regel „${rule.name}“ löschen`}
                          onClick={() => {
                            void removeRule(rule);
                          }}
                          disabled={busyId === rule.id}
                        >
                          <TrashIcon />
                        </IconButton>
                        <button
                          type="button"
                          role="switch"
                          className="apill"
                          aria-checked={rule.enabled}
                          aria-label={`Regel ${conditionText}, ${actionText}`}
                          disabled={busyId === rule.id}
                          style={busyId === rule.id ? { opacity: 0.45 } : undefined}
                          onClick={() => {
                            void toggleRule(rule);
                          }}
                        >
                          <span>
                            <span>{rule.enabled ? "aktiv" : "inaktiv"}</span>
                          </span>
                        </button>
                      </div>
                    </footer>
                  </article>
                </div>
              );
            })}
          </div>
        </Group>

        <ExecutionLog executions={allExecutions} />
      </View>

      <div className="addbar" data-od-id="add-bar">
        <Button block onClick={openCreate}>
          <PlusIcon />
          Neue Automation
        </Button>
      </div>

      <AutomationForm
        open={formOpen}
        initial={editing}
        rooms={rooms}
        onClose={closeForm}
        onSubmit={submitForm}
      />
    </>
  );
}
