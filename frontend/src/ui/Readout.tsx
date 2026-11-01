import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface ReadoutEntry {
  label: ReactNode;
  value: ReactNode;
  word?: boolean;
}

export interface ReadoutProps {
  label?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  entries?: readonly ReadoutEntry[];
  className?: string;
  id?: string;
}

export function Readout({
  label,
  value,
  unit,
  entries,
  className,
  id,
}: ReadoutProps): ReactElement {
  return (
    <div id={id} className={cn("readout", className)}>
      {label ? <div className="label">{label}</div> : null}
      <div className="bigfig">
        <span className="n">{value}</span>
        {unit ? <span className="u">{unit}</span> : null}
      </div>
      {entries && entries.length > 0 ? (
        <ul className="ledger">
          {entries.map((entry, index) => (
            <li key={index}>
              <span className="k">{entry.label}</span>
              <span className={cn("v", entry.word && "word")}>{entry.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export interface SplitProps {
  children: ReactNode;
  className?: string;
}

export function Split({ children, className }: SplitProps): ReactElement {
  return <div className={cn("split", className)}>{children}</div>;
}
