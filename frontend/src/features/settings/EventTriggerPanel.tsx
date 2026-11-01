/**
 * `events` region of the settings screen.
 *
 * Each button forces one of the contract's manual events. The trigger runs
 * against the live simulation, so the resulting message and the changed sensor
 * values arrive through the live state without a reload.
 */

import { useState, type ReactElement } from "react";

import { ApiError, triggerEvent } from "../../lib/api";
import { formatSimTime } from "../../lib/format";
import type { EventType, MessageOut } from "../../lib/types";
import { Badge, Banner, Group } from "../../ui";

interface EventDefinition {
  type: EventType;
  label: string;
}

const EVENTS: readonly EventDefinition[] = [
  { type: "forgotten_window", label: "Vergessenes Fenster" },
  { type: "water_damage", label: "Wasserschaden" },
  { type: "power_spike", label: "Stromspitze" },
  { type: "smoke_alarm", label: "Rauchalarm" },
  { type: "occupant_rush", label: "Bewohner-Andrang" },
];

function EventIcon({ type }: { type: EventType }): ReactElement {
  switch (type) {
    case "forgotten_window":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M10 21H2m8-18H7a2 2 0 0 0-2 2v16m9-9h.01" />
            <path d="M19 21V5a2 2 0 0 0-1.675-1.974l-6.163-1.013A1 1 0 0 0 10 3v18a1 1 0 0 0 1.124.992zm3 0h-3" />
          </g>
        </svg>
      );
    case "water_damage":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M7 16.3c2.2 0 4-1.83 4-4.05c0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05" />
            <path d="M12.56 6.6A11 11 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
          </g>
        </svg>
      );
    case "power_spike":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z"
          />
        </svg>
      );
    case "smoke_alarm":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0a5 5 0 0 1 1-3a1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"
          />
        </svg>
      );
    case "occupant_rush":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.128a4 4 0 0 1 0 7.744M22 21v-2a4 4 0 0 0-3-3.87" />
            <circle cx="9" cy="7" r="4" />
          </g>
        </svg>
      );
  }
}

const SEVERITY: Record<MessageOut["severity"], { label: string; tone: "hi" | "mid" | "lo" }> = {
  critical: { label: "hoch", tone: "hi" },
  warning: { label: "mittel", tone: "mid" },
  info: { label: "info", tone: "lo" },
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Das Ereignis konnte nicht ausgelöst werden.";
}

export function EventTriggerPanel(): ReactElement {
  const [pending, setPending] = useState<EventType | null>(null);
  const [result, setResult] = useState<MessageOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fire(type: EventType): Promise<void> {
    setPending(type);
    setError(null);
    try {
      const response = await triggerEvent(type, null);
      setResult(response.message);
    } catch (triggerError) {
      setError(errorMessage(triggerError));
    } finally {
      setPending(null);
    }
  }

  const severity = result ? SEVERITY[result.severity] : null;

  return (
    <Group title="Ereignisse auslösen" ariaLabel="Ereignisse auslösen" id="settings-events">
      <div className="events">
        {EVENTS.map((event) => (
          <button
            key={event.type}
            type="button"
            className="ev"
            data-event={event.type}
            disabled={pending !== null}
            aria-busy={pending === event.type}
            onClick={() => void fire(event.type)}
          >
            <EventIcon type={event.type} />
            {event.label}
          </button>
        ))}
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {result && severity ? (
        <div className="note" role="status" aria-live="polite">
          <Badge tone={severity.tone}>{severity.label}</Badge>
          <span>
            {result.text} · {result.room_name ?? "Ganzes Haus"} ·{" "}
            {formatSimTime(result.created_at)} (simuliert)
          </span>
        </div>
      ) : null}
    </Group>
  );
}
