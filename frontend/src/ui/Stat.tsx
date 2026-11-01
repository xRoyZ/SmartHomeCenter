import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
}

export function Stat({ label, value, unit, className }: StatProps): ReactElement {
  return (
    <div className={cn("stat", className)}>
      <b>
        {value}
        {unit ? <> {unit}</> : null}
      </b>
      <small>{label}</small>
    </div>
  );
}
