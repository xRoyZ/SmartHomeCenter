import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export type BadgeTone = "hi" | "mid" | "lo";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "lo", children, className }: BadgeProps): ReactElement {
  return <span className={cn("sev", tone, className)}>{children}</span>;
}
