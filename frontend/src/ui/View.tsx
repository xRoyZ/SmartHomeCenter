import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface ViewProps {
  children: ReactNode;
  className?: string;
}

export function View({ children, className }: ViewProps): ReactElement {
  return <div className={cn("view", className)}>{children}</div>;
}
