/**
 * Setpoint region of the device detail screen.
 *
 * The control follows the device type: a heating device gets the setpoint
 * stepper of the approved mockup, a dimmable or movable device its percentage
 * stepper and a switched device its on/off toggle. Every change is handed to
 * the page, which owns the API call.
 */

import type { ReactElement } from "react";

import { cn } from "../../lib/cn";
import {
  formatInteger,
  formatPowerWatts,
  formatTemperature,
} from "../../lib/format";
import type { DeviceCommand, DeviceState } from "../../lib/types";
import { Banner, Stepper, Toggle } from "../../ui";

export interface DeviceControlProps {
  device: DeviceState;
  roomName: string;
  roomTemperature: number | null;
  onChange: (command: DeviceCommand) => void;
  error?: string | null;
}

/** German decimal figure with a fixed number of shown decimals. */
export function formatDecimal(value: number, decimals = 1): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Short German state word for the dark device block. */
export function deviceStateWord(device: DeviceState): string {
  switch (device.type) {
    case "heating":
      return device.is_on ? "HEIZT" : "AUS";
    case "light":
      return device.is_on ? "AN" : "AUS";
    case "shutter": {
      const level = device.level ?? 0;
      return level > 0 ? `${formatInteger(level)} % OFFEN` : "ZU";
    }
    default:
      return device.is_on ? "AN" : "AUS";
  }
}

/** Current load of the device as a percentage of its working range. */
export function deviceLoadPercent(device: DeviceState): number {
  if (device.level !== null) {
    return Math.max(0, Math.min(100, device.level));
  }
  return device.is_on ? 100 : 0;
}

function controlTitle(device: DeviceState): string {
  switch (device.type) {
    case "heating":
      return "Soll einstellen";
    case "light":
      return "Helligkeit einstellen";
    case "shutter":
      return "Rollladen einstellen";
    default:
      return "Gerät schalten";
  }
}

function controlLabel(device: DeviceState): string {
  switch (device.type) {
    case "heating":
      return "Solltemperatur einstellen";
    case "light":
      return "Helligkeit einstellen";
    case "shutter":
      return "Rollladenposition einstellen";
    default:
      return "Gerät ein- und ausschalten";
  }
}

function LedgerRow({
  label,
  value,
  unit,
  word = false,
}: {
  label: string;
  value: string;
  unit?: string;
  word?: boolean;
}): ReactElement {
  return (
    <li>
      <span className="k">{label}</span>
      <span className={cn("v", word && "word")}>
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
    </li>
  );
}

export function DeviceControl({
  device,
  roomName,
  roomTemperature,
  onChange,
  error = null,
}: DeviceControlProps): ReactElement {
  return (
    <section
      className="group"
      data-od-id="setpoint"
      aria-label={controlLabel(device)}
    >
      <h2>{controlTitle(device)}</h2>

      {device.type === "heating" ? (
        <Stepper
          label="Solltemperatur"
          value={device.target_temp ?? 20}
          min={5}
          max={28}
          step={0.5}
          decimals={1}
          unit="°C"
          onChange={(value) => onChange({ target_temp: value })}
        />
      ) : null}

      {device.type === "light" ? (
        <Stepper
          label="Helligkeit"
          value={device.level ?? (device.is_on ? 100 : 0)}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={(value) => onChange({ level: value })}
        />
      ) : null}

      {device.type === "shutter" ? (
        <Stepper
          label="Rollladenposition"
          value={device.level ?? 0}
          min={0}
          max={100}
          step={5}
          unit="%"
          onChange={(value) => onChange({ level: value })}
        />
      ) : null}

      {device.type === "plug" || device.type === "appliance" ? (
        <Toggle
          checked={device.is_on}
          onChange={(checked) => onChange({ is_on: checked })}
          label={`${device.name} ${roomName}`}
        />
      ) : null}

      <ul className="ledger">
        {device.type === "heating" ? (
          <>
            <LedgerRow
              label="Soll"
              value={
                device.target_temp === null ? "–" : formatDecimal(device.target_temp)
              }
              unit="°C"
            />
            <LedgerRow
              label="Ist"
              value={roomTemperature === null ? "–" : formatDecimal(roomTemperature)}
              unit="°C"
            />
            <LedgerRow
              label="Leistung"
              value={formatInteger(deviceLoadPercent(device))}
              unit="%"
            />
          </>
        ) : null}

        {device.type === "light" ? (
          <>
            <LedgerRow
              label="Helligkeit"
              value={formatInteger(device.level ?? 0)}
              unit="%"
            />
            <LedgerRow
              label="Verbrauch"
              value={formatInteger(device.power_w)}
              unit="W"
            />
          </>
        ) : null}

        {device.type === "shutter" ? (
          <>
            <LedgerRow
              label="Position"
              value={formatInteger(device.level ?? 0)}
              unit="% offen"
            />
            <LedgerRow
              label="Verbrauch"
              value={formatInteger(device.power_w)}
              unit="W"
            />
          </>
        ) : null}

        {device.type === "plug" || device.type === "appliance" ? (
          <>
            <LedgerRow
              label="Zustand"
              value={device.is_on ? "an" : "aus"}
              word
            />
            <LedgerRow
              label="Verbrauch"
              value={formatInteger(device.power_w)}
              unit="W"
            />
          </>
        ) : null}
      </ul>

      {error ? <Banner tone="error">{error}</Banner> : null}
    </section>
  );
}

/** Plain German reading of the device's current draw, used above the fold. */
export function devicePowerText(device: DeviceState): string {
  return formatPowerWatts(device.power_w);
}

/** Plain German reading of the room temperature around the device. */
export function deviceRoomTemperatureText(temperature: number | null): string {
  return temperature === null ? "–" : formatTemperature(temperature);
}
