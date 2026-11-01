import type { ReactElement } from "react";

import { cn } from "../lib/cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  onText?: string;
  offText?: string;
  disabled?: boolean;
  size?: "md" | "sm";
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  onText = "an",
  offText = "aus",
  disabled = false,
  size = "md",
  className,
}: ToggleProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      className={cn("sw", size === "sm" && "sm", className)}
      onClick={() => onChange(!checked)}
    >
      <span className="pill">
        <span className="knob" />
        <span className="txt">{checked ? onText : offText}</span>
      </span>
    </button>
  );
}
