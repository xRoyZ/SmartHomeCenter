import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface ProseProps {
  children: ReactNode;
  className?: string;
}

export function Prose({ children, className }: ProseProps): ReactElement {
  return <div className={cn("prose", className)}>{children}</div>;
}
