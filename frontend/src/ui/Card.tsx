import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export interface CardProps {
  children: ReactNode;
  heading?: ReactNode;
  className?: string;
  id?: string;
}

export function Card({ children, heading, className, id }: CardProps): ReactElement {
  return (
    <section id={id} className={cn("card", className)}>
      {heading ? <h2 className="h2">{heading}</h2> : null}
      {children}
    </section>
  );
}
