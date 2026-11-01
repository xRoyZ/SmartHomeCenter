import { useId, type InputHTMLAttributes, type ReactElement } from "react";

import { cn } from "../lib/cn";

export interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  type?: "text" | "number" | "search";
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

function AlertIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4m0 4h.01" />
      </g>
    </svg>
  );
}

export function Field({
  label,
  value,
  onChange,
  id,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  error,
  hint,
  disabled = false,
  className,
}: FieldProps): ReactElement {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("fieldgroup", className)}>
      <label className="label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className="field"
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p className="errtext" id={errorId} role="alert">
          <AlertIcon />
          {error}
        </p>
      ) : hint ? (
        <p className="fieldhint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
