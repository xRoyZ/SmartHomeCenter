import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface GroupProps {
  children: ReactNode;
  title?: ReactNode;
  ariaLabel?: string;
  className?: string;
  id?: string;
}

export function Group({ children, title, ariaLabel, className, id }: GroupProps): ReactElement {
  return (
    <section id={id} className={cn("group", className)} aria-label={ariaLabel}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
