/**
 * One entry of the message list.
 *
 * Open messages carry the acknowledge action; acknowledged messages show the
 * simulated time at which somebody confirmed them. The severity mark is the UI
 * kit's badge, the row itself is the kit's list row.
 */

import type { ReactElement } from "react";

import { formatSimTime } from "../../lib/format";
import type { MessageOut, MessageSeverity } from "../../lib/types";
import { Badge, Button, ListRow, type BadgeTone } from "../../ui";

interface SeverityMark {
  tone: BadgeTone;
  label: string;
}

const SEVERITY: Record<MessageSeverity, SeverityMark> = {
  critical: { tone: "hi", label: "hoch" },
  warning: { tone: "mid", label: "mittel" },
  info: { tone: "lo", label: "info" },
};

export interface MessageRowProps {
  message: MessageOut;
  onAcknowledge?: (message: MessageOut) => void;
  pending?: boolean;
  disabled?: boolean;
}

export function MessageRow({
  message,
  onAcknowledge,
  pending = false,
  disabled = false,
}: MessageRowProps): ReactElement {
  const severity = SEVERITY[message.severity];

  return (
    <ListRow className="mrow">
      <Badge tone={severity.tone}>{severity.label}</Badge>
      <span className="room-n">{message.room_name ?? "Haus"}</span>
      <time dateTime={message.created_at}>{formatSimTime(message.created_at)}</time>
      <span className="val">{message.text}</span>
      {onAcknowledge ? (
        <Button
          variant="secondary"
          size="sm"
          className="act"
          disabled={disabled}
          aria-busy={pending || undefined}
          onClick={() => onAcknowledge(message)}
        >
          {pending ? "Bestätigen …" : "Bestätigen"}
        </Button>
      ) : (
        <span className="act">
          {message.acknowledged_at
            ? `bestätigt ${formatSimTime(message.acknowledged_at)}`
            : "bestätigt"}
        </span>
      )}
    </ListRow>
  );
}
