import { useId, type ReactElement } from "react";

import { cn } from "../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  label,
  id,
  disabled = false,
  className,
}: SelectProps): ReactElement {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className={cn("selectfield", className)}>
      {label ? (
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        className="select"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
