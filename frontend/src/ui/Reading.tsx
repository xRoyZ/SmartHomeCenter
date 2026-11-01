import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export type ReadingSize = "sm" | "md" | "lg";
export type ReadingVariant = "reading" | "val";

export interface ReadingProps {
  value: ReactNode;
  unit?: ReactNode;
  size?: ReadingSize;
  variant?: ReadingVariant;
  className?: string;
}

export function Reading({
  value,
  unit,
  size = "md",
  variant = "reading",
  className,
}: ReadingProps): ReactElement {
  return (
    <span className={cn("reading", `reading-${size}`, variant === "val" && "val", className)}>
      <span className="n">{value}</span>
      {unit ? variant === "val" ? <small>{unit}</small> : <span className="u">{unit}</span> : null}
    </span>
  );
}
