import type { ReactElement } from "react";

import { cn } from "../lib/cn";
import { IconButton } from "./IconButton";

export interface StepperProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  className?: string;
}

function MinusIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14"
      />
    </svg>
  );
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

export function Stepper({
  value,
  min,
  max,
  step,
  label,
  onChange,
  unit,
  decimals = 0,
  disabled = false,
  className,
}: StepperProps): ReactElement {
  const atMin = value <= min;
  const atMax = value >= max;
  const display = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  const shift = (direction: -1 | 1) => {
    const next = Number(Math.min(max, Math.max(min, value + direction * step)).toFixed(decimals));
    if (next !== value) {
      onChange(next);
    }
  };

  return (
    <span className={cn("stepper", className)}>
      <IconButton
        label={`${label} senken`}
        onClick={() => shift(-1)}
        disabled={disabled || atMin}
      >
        <MinusIcon />
      </IconButton>
      <span className="val">
        {display}
        {unit ? <small>{unit}</small> : null}
      </span>
      <IconButton
        label={`${label} erhöhen`}
        onClick={() => shift(1)}
        disabled={disabled || atMax}
      >
        <PlusIcon />
      </IconButton>
    </span>
  );
}
