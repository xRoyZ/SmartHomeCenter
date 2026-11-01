import { useEffect, useState, type FormEvent, type ReactElement } from "react";

import { formatInteger, formatNumber } from "../../lib/format";
import type {
  ActionInput,
  ActionType,
  AutomationInput,
  AutomationOut,
  ConditionInput,
  ConditionType,
} from "../../lib/types";
import { Banner, Button, Checkbox, Dialog, Field, Select } from "../../ui";

export interface RoomOption {
  id: string;
  name: string;
}

export interface AutomationFormProps {
  open: boolean;
  initial: AutomationOut | null;
  rooms: RoomOption[];
  onClose: () => void;
  onSubmit: (input: AutomationInput) => Promise<void>;
}

const CONDITION_OPTIONS: readonly { value: ConditionType; label: string }[] = [
  { value: "window_open", label: "Fenster offen" },
  { value: "temperature_below", label: "Temperatur unter 18 °C" },
  { value: "co2_above", label: "CO₂ über 1.000 ppm" },
  { value: "time_after", label: "ab 22:00" },
  { value: "temperature_above", label: "Temperatur über …" },
  { value: "time_before", label: "vor …" },
];

const ACTION_OPTIONS: readonly { value: ActionType; label: string }[] = [
  { value: "heating_off", label: "Heizung aus" },
  { value: "light_on", label: "Licht an" },
  { value: "shutter_close", label: "Rollladen schließen" },
  { value: "heating_set", label: "Heizung auf …" },
  { value: "light_off", label: "Licht aus" },
  { value: "shutter_set", label: "Rollladen auf …" },
  { value: "plug_off", label: "Steckdose aus" },
];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const FALLBACK_ERROR = "Die Regel konnte nicht gespeichert werden.";

function isConditionWithValue(type: ConditionType): boolean {
  return type === "temperature_below" || type === "temperature_above" || type === "co2_above";
}

function isConditionWithTime(type: ConditionType): boolean {
  return type === "time_after" || type === "time_before";
}

function actionNeedsValue(type: ActionType): boolean {
  return type === "heating_set" || type === "shutter_set";
}

function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return FALLBACK_ERROR;
}

export function describeCondition(condition: ConditionInput): string {
  switch (condition.type) {
    case "window_open":
      return "Fenster offen";
    case "temperature_below":
      return condition.value === null
        ? "Temperatur unter …"
        : `Temperatur unter ${formatNumber(condition.value, 1)} °C`;
    case "temperature_above":
      return condition.value === null
        ? "Temperatur über …"
        : `Temperatur über ${formatNumber(condition.value, 1)} °C`;
    case "co2_above":
      return condition.value === null
        ? "CO₂ über …"
        : `CO₂ über ${formatInteger(condition.value)} ppm`;
    case "time_after":
      return condition.time === null ? "ab …" : `ab ${condition.time}`;
    case "time_before":
      return condition.time === null ? "vor …" : `vor ${condition.time}`;
  }
}

export function describeAction(action: ActionInput): string {
  switch (action.type) {
    case "heating_off":
      return "Heizung aus";
    case "heating_set":
      return action.value === null
        ? "Heizung auf …"
        : `Heizung auf ${formatNumber(action.value, 1)} °C`;
    case "light_on":
      return "Licht an";
    case "light_off":
      return "Licht aus";
    case "shutter_close":
      return "Rollladen schließen";
    case "shutter_set":
      return action.value === null
        ? "Rollladen auf …"
        : `Rollladen auf ${formatInteger(action.value)} %`;
    case "plug_off":
      return "Steckdose aus";
  }
}

export function AutomationForm({
  open,
  initial,
  rooms,
  onClose,
  onSubmit,
}: AutomationFormProps): ReactElement {
  const [name, setName] = useState("");
  const [when, setWhen] = useState<ConditionType>("window_open");
  const [then, setThen] = useState<ActionType>("heating_off");
  const [roomId, setRoomId] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionTime, setConditionTime] = useState("22:00");
  const [actionValue, setActionValue] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setSubmitting(false);
    if (initial) {
      setName(initial.name);
      setWhen(initial.condition.type);
      setThen(initial.action.type);
      setRoomId(initial.action.room_id || initial.condition.room_id || "");
      setConditionValue(
        initial.condition.value === null ? "" : String(initial.condition.value),
      );
      setConditionTime(initial.condition.time ?? "22:00");
      setActionValue(initial.action.value === null ? "" : String(initial.action.value));
      setNotify(initial.notify);
    } else {
      setName("");
      setWhen("window_open");
      setThen("heating_off");
      setRoomId(rooms[0]?.id ?? "");
      setConditionValue("");
      setConditionTime("22:00");
      setActionValue("");
      setNotify(true);
    }
    // The room list is allowed to arrive later; a separate effect fills the
    // empty choice without touching a value the user already picked.
  }, [open, initial]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRoomId((current) => current || rooms[0]?.id || "");
  }, [open, rooms]);

  const handleWhenChange = (next: string): void => {
    const type = next as ConditionType;
    setWhen(type);
    setError(null);
    if (type === "temperature_below" || type === "temperature_above") {
      setConditionValue("18");
    } else if (type === "co2_above") {
      setConditionValue("1000");
    } else {
      setConditionValue("");
    }
    if (isConditionWithTime(type)) {
      setConditionTime((current) => current || "22:00");
    }
  };

  const handleThenChange = (next: string): void => {
    const type = next as ActionType;
    setThen(type);
    setError(null);
    if (type === "heating_set") {
      setActionValue("21");
    } else if (type === "shutter_set") {
      setActionValue("100");
    } else {
      setActionValue("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!roomId) {
      setError("Bitte einen Raum für die Aktion wählen.");
      return;
    }

    let parsedConditionValue: number | null = null;
    if (isConditionWithValue(when)) {
      parsedConditionValue = parseNumber(conditionValue);
      if (parsedConditionValue === null) {
        setError("Bitte einen gültigen Grenzwert angeben.");
        return;
      }
      if (when === "co2_above") {
        if (parsedConditionValue < 0 || parsedConditionValue > 10000) {
          setError("Der CO₂-Grenzwert muss zwischen 0 und 10.000 ppm liegen.");
          return;
        }
      } else if (parsedConditionValue < -50 || parsedConditionValue > 60) {
        setError("Der Temperaturgrenzwert muss zwischen -50 und 60 °C liegen.");
        return;
      }
    }

    if (isConditionWithTime(when) && !TIME_PATTERN.test(conditionTime.trim())) {
      setError("Bitte eine Uhrzeit im Format HH:MM angeben (z. B. 22:00).");
      return;
    }

    let parsedActionValue: number | null = null;
    if (actionNeedsValue(then)) {
      parsedActionValue = parseNumber(actionValue);
      if (parsedActionValue === null) {
        setError("Bitte einen gültigen Wert für die Aktion angeben.");
        return;
      }
      if (then === "heating_set" && (parsedActionValue < 5 || parsedActionValue > 30)) {
        setError("Die Zieltemperatur muss zwischen 5 und 30 °C liegen.");
        return;
      }
      if (then === "shutter_set" && (parsedActionValue < 0 || parsedActionValue > 100)) {
        setError("Der Öffnungsgrad muss zwischen 0 und 100 % liegen.");
        return;
      }
    }

    const condition: ConditionInput = {
      type: when,
      room_id: isConditionWithTime(when) ? null : roomId,
      value: isConditionWithValue(when) ? parsedConditionValue : null,
      time: isConditionWithTime(when) ? conditionTime.trim() : null,
    };
    const action: ActionInput = {
      type: then,
      room_id: roomId,
      device_id: null,
      value: actionNeedsValue(then) ? parsedActionValue : null,
    };
    const generatedName = `${describeCondition(condition)} – ${describeAction(action)}`;
    const finalName = name.trim() === "" ? generatedName : name.trim();
    if (finalName.length > 120) {
      setError("Der Name darf höchstens 120 Zeichen lang sein.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: finalName,
        enabled: initial?.enabled ?? true,
        condition,
        action,
        notify,
      });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!submitting) {
          onClose();
        }
      }}
      title={initial ? "Automation bearbeiten" : "Neue Automation"}
    >
      <form
        style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <Select
          label="Wenn"
          options={CONDITION_OPTIONS}
          value={when}
          onChange={handleWhenChange}
        />

        <Select
          label="Raum für Bedingung und Aktion"
          options={rooms.map((room) => ({ value: room.id, label: room.name }))}
          value={roomId}
          onChange={(next) => {
            setRoomId(next);
            setError(null);
          }}
          disabled={rooms.length === 0}
        />

        {isConditionWithValue(when) ? (
          <Field
            label={when === "co2_above" ? "Grenzwert (ppm)" : "Grenzwert (°C)"}
            value={conditionValue}
            onChange={(next) => {
              setConditionValue(next);
              setError(null);
            }}
            inputMode="decimal"
          />
        ) : null}

        {isConditionWithTime(when) ? (
          <Field
            label="Uhrzeit (HH:MM)"
            value={conditionTime}
            onChange={(next) => {
              setConditionTime(next);
              setError(null);
            }}
            placeholder="22:00"
          />
        ) : null}

        <Select
          label="Dann"
          options={ACTION_OPTIONS}
          value={then}
          onChange={handleThenChange}
        />

        {actionNeedsValue(then) ? (
          <Field
            label={then === "heating_set" ? "Zieltemperatur (°C)" : "Öffnungsgrad (%)"}
            value={actionValue}
            onChange={(next) => {
              setActionValue(next);
              setError(null);
            }}
            inputMode="decimal"
          />
        ) : null}

        <Checkbox checked={notify} onChange={setNotify}>
          Mit Meldung
        </Checkbox>

        <Field
          label="Name"
          value={name}
          onChange={(next) => {
            setName(next);
            setError(null);
          }}
          hint="Leer lassen für einen automatischen Namen."
        />

        {rooms.length === 0 ? (
          <Banner tone="warning">Die Räume werden noch geladen.</Banner>
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="acts">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={submitting || rooms.length === 0}>
            {initial ? "Regel speichern" : "Regel anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
