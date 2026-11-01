/**
 * Messages screen.
 *
 * Open alerts until somebody confirms them, acknowledged ones stay readable
 * below. Both lists are loaded from the message API, a confirmation moves the
 * entry over without a reload and the live house state refreshes the lists as
 * the simulation advances. A failed call keeps the lists as they were and shows
 * the server's German message.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { MessageRow } from "../features/messages/MessageRow";
import { ApiError, ackMessage, getMessages } from "../lib/api";
import { useLiveState } from "../lib/liveState";
import type { MessageOut } from "../lib/types";
import { Banner, EmptyState, PageHead, View } from "../ui";

const FALLBACK_ERROR = "Ein interner Fehler ist aufgetreten.";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_ERROR;
}

function byNewest(a: MessageOut, b: MessageOut): number {
  const byTime = b.created_at.localeCompare(a.created_at);
  return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
}

function withAcknowledged(list: MessageOut[], message: MessageOut): MessageOut[] {
  return [message, ...list.filter((item) => item.id !== message.id)].sort(byNewest);
}

export function Messages(): ReactElement {
  const { state } = useLiveState();
  const [openMessages, setOpenMessages] = useState<MessageOut[]>([]);
  const [doneMessages, setDoneMessages] = useState<MessageOut[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const acknowledgedIds = useRef(new Set<string>());
  const loadSequence = useRef(0);
  const tick = state?.tick ?? null;

  useEffect(() => {
    let disposed = false;
    const sequence = ++loadSequence.current;

    const load = async (): Promise<void> => {
      try {
        const [open, done] = await Promise.all([
          getMessages("open"),
          getMessages("acknowledged"),
        ]);
        // The clock reloads the lists every tick, so a response that was
        // requested before a confirmation or superseded by a newer reload must
        // not put an already acknowledged message back into the open group.
        if (!disposed && sequence === loadSequence.current) {
          const acknowledged = acknowledgedIds.current;
          setOpenMessages(open.filter((item) => !acknowledged.has(item.id)));
          setDoneMessages(done);
          setLoadError(null);
        }
      } catch (error) {
        if (!disposed && sequence === loadSequence.current) {
          setLoadError(errorMessage(error));
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, [tick]);

  const acknowledge = useCallback(async (message: MessageOut): Promise<void> => {
    setPendingId(message.id);
    try {
      const acknowledged = await ackMessage(message.id);
      acknowledgedIds.current.add(message.id);
      // Discard reloads that were already in flight when the confirmation
      // happened, then move the row over without waiting for the next tick.
      loadSequence.current += 1;
      setOpenMessages((current) => current.filter((item) => item.id !== message.id));
      setDoneMessages((current) => withAcknowledged(current, acknowledged));
      setActionError(null);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPendingId(null);
    }
  }, []);

  const error = actionError ?? loadError;

  return (
    <View>
      <PageHead
        title="Meldungen"
        description="Was das Haus gemeldet hat — offen, bis jemand es bestätigt, danach weiter lesbar."
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section
        className="mgroup group-open"
        data-od-id="messages-open"
        aria-label="Offene Meldungen"
      >
        <header>
          <span>Offen</span>
          <b id="count-open">{openMessages.length}</b>
        </header>
        <ul id="list-open">
          {openMessages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              onAcknowledge={acknowledge}
              pending={pendingId === message.id}
              disabled={pendingId !== null}
            />
          ))}
        </ul>
        {!loadError && openMessages.length === 0 ? (
          <EmptyState>Alles bestätigt — das Haus hat gerade nichts zu melden.</EmptyState>
        ) : null}
      </section>

      <section
        className="mgroup group-done"
        data-od-id="messages-done"
        aria-label="Bestätigte Meldungen"
      >
        <header>
          <span>Bestätigt</span>
          <b id="count-done">{doneMessages.length}</b>
        </header>
        <ul id="list-done">
          {doneMessages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </ul>
        {!loadError && doneMessages.length === 0 ? (
          <EmptyState>Noch nichts bestätigt.</EmptyState>
        ) : null}
      </section>
    </View>
  );
}
