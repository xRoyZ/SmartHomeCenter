import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface EmptyStateProps {
  children: ReactNode;
  className?: string;
  as?: "p" | "div";
}

export function EmptyState({
  children,
  className,
  as = "p",
}: EmptyStateProps): ReactElement {
  const classes = cn("empty", className);
  if (as === "div") {
    return <div className={classes}>{children}</div>;
  }
  return <p className={classes}>{children}</p>;
}
