import { useId, type ReactElement, type ReactNode } from "react";

import { cn } from "../lib/cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onChange,
  children,
  id,
  disabled = false,
  className,
}: CheckboxProps): ReactElement {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <label className={cn("check", className)} htmlFor={fieldId}>
      <input
        id={fieldId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}
