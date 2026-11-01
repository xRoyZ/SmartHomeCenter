/**
 * Device rows of the room detail screen.
 *
 * Every device the room owns gets a row with its German plain-text state, a
 * control the device type accepts and a link to its detail screen. The shutter
 * is labelled in percent closed like the approved screen while the command sent
 * to the API carries the simulation's open percentage.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import {
  formatPercent,
  formatPowerWatts,
  formatTemperature,
} from "../../lib/format";
import type { DeviceCommand, DeviceState } from "../../lib/types";
import { Group, Slider, Stepper, Toggle } from "../../ui";

export interface DeviceControlListProps {
  devices: readonly DeviceState[];
  roomName: string;
  roomTemperature: number;
  onCommand: (device: DeviceState, command: DeviceCommand) => void;
}

function ArrowIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14m-7-7l7 7l-7 7"
      />
    </svg>
  );
}

const NAME_LINK_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--s1)",
  minHeight: "var(--hit)",
} as const;

function DeviceName({ device }: { device: DeviceState }): ReactElement {
  return (
    <Link
      to={`/devices/${encodeURIComponent(device.id)}`}
      className="name"
      aria-label={`${device.name} öffnen`}
      style={NAME_LINK_STYLE}
    >
      {device.name}
      <ArrowIcon />
    </Link>
  );
}

function closedPercent(level: number | null): number {
  const open = Math.max(0, Math.min(100, level ?? 0));
  return 100 - open;
}

function LightRow({
  device,
  roomName,
  onCommand,
}: {
  device: DeviceState;
  roomName: string;
  onCommand: DeviceControlListProps["onCommand"];
}): ReactElement {
  const level = device.level ?? 0;
  return (
    <div className="dev-row" data-od-id="dev-light">
      <DeviceName device={device} />
      <span className="val">
        <b>{device.is_on ? "Licht an" : "Licht aus"}</b> · {formatPercent(level)}
      </span>
      <span className="ctl">
        <Toggle
          checked={device.is_on}
          label={`${device.name} ${roomName}`}
          onChange={(next) => onCommand(device, { is_on: next })}
        />
      </span>
      <div className="full">
        <Slider
          label="Helligkeit Licht in Prozent"
          value={level}
          min={0}
          max={100}
          step={5}
          onChange={(next) => onCommand(device, { level: next })}
        />
      </div>
    </div>
  );
}

function ShutterRow({
  device,
  onCommand,
}: {
  device: DeviceState;
  onCommand: DeviceControlListProps["onCommand"];
}): ReactElement {
  const closed = closedPercent(device.level);
  return (
    <div className="dev-row" data-od-id="dev-shutter">
      <DeviceName device={device} />
      <span className="val">
        <b>{formatPercent(closed)}</b> geschlossen
      </span>
      <div className="full">
        <Slider
          label="Rollladen in Prozent geschlossen"
          value={closed}
          min={0}
          max={100}
          step={5}
          onChange={(next) => onCommand(device, { level: 100 - next })}
        />
      </div>
    </div>
  );
}

function PlugRow({
  device,
  roomName,
  onCommand,
}: {
  device: DeviceState;
  roomName: string;
  onCommand: DeviceControlListProps["onCommand"];
}): ReactElement {
  return (
    <div className="dev-row" data-od-id="dev-plug">
      <DeviceName device={device} />
      <span className="val">
        <b>{device.is_on ? "Steckdose an" : "Steckdose aus"}</b> ·{" "}
        {formatPowerWatts(device.power_w)}
      </span>
      <span className="ctl">
        <Toggle
          checked={device.is_on}
          label={`${device.name} ${roomName}`}
          onChange={(next) => onCommand(device, { is_on: next })}
        />
      </span>
    </div>
  );
}

function ApplianceRow({
  device,
  roomName,
  onCommand,
}: {
  device: DeviceState;
  roomName: string;
  onCommand: DeviceControlListProps["onCommand"];
}): ReactElement {
  return (
    <div className="dev-row" data-od-id="dev-appliance">
      <DeviceName device={device} />
      <span className="val">
        <b>
          {device.name} {device.is_on ? "an" : "aus"}
        </b>{" "}
        · {formatPowerWatts(device.power_w)}
      </span>
      <span className="ctl">
        <Toggle
          checked={device.is_on}
          label={`${device.name} ${roomName}`}
          onChange={(next) => onCommand(device, { is_on: next })}
        />
      </span>
    </div>
  );
}

function HeatingRows({
  device,
  roomTemperature,
  onCommand,
}: {
  device: DeviceState;
  roomTemperature: number;
  onCommand: DeviceControlListProps["onCommand"];
}): ReactElement {
  const target = device.target_temp ?? 21;
  const reached = target <= roomTemperature;
  return (
    <>
      <div className="dev-row" data-od-id="dev-heating">
        <DeviceName device={device} />
        <span className="val">
          <b>{formatTemperature(target)}</b> Soll
        </span>
        <span className="ctl">
          <Stepper
            value={target}
            min={5}
            max={28}
            step={0.5}
            decimals={1}
            unit="°C"
            label="Solltemperatur"
            onChange={(next) => onCommand(device, { target_temp: next })}
          />
        </span>
      </div>
      <div className="dev-row" data-od-id="dev-heating-power">
        <span className="name">Heizleistung</span>
        <span className="val">
          Ist {formatTemperature(roomTemperature)} ·{" "}
          {reached ? "Ziel erreicht" : "Ziel noch nicht erreicht"}
        </span>
        <span className="ctl">
          <span className="stepper">
            <span className="val">{formatPowerWatts(device.power_w)}</span>
          </span>
        </span>
      </div>
    </>
  );
}

export function DeviceControlList({
  devices,
  roomName,
  roomTemperature,
  onCommand,
}: DeviceControlListProps): ReactElement {
  return (
    <Group title="Geräte" ariaLabel="Geräte bedienen">
      <div className="dev">
        {devices.map((device) => {
          if (device.type === "heating") {
            return (
              <HeatingRows
                key={device.id}
                device={device}
                roomTemperature={roomTemperature}
                onCommand={onCommand}
              />
            );
          }
          if (device.type === "light") {
            return (
              <LightRow
                key={device.id}
                device={device}
                roomName={roomName}
                onCommand={onCommand}
              />
            );
          }
          if (device.type === "shutter") {
            return <ShutterRow key={device.id} device={device} onCommand={onCommand} />;
          }
          if (device.type === "plug") {
            return (
              <PlugRow
                key={device.id}
                device={device}
                roomName={roomName}
                onCommand={onCommand}
              />
            );
          }
          return (
            <ApplianceRow
              key={device.id}
              device={device}
              roomName={roomName}
              onCommand={onCommand}
            />
          );
        })}
      </div>
    </Group>
  );
}
