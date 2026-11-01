import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";
import { ListRow } from "./ListRow";

export interface JumpLinkItem {
  to: string;
  label: ReactNode;
  hint?: ReactNode;
}

export interface JumpLinksProps {
  links: readonly JumpLinkItem[];
  label?: string;
  className?: string;
}

export function JumpLinks({
  links,
  label = "Weitere Seiten",
  className,
}: JumpLinksProps): ReactElement {
  return (
    <nav className={cn("jump", className)} aria-label={label} data-od-id="jump">
      {links.map((link, index) => (
        <ListRow key={index} to={link.to} hint={link.hint}>
          {link.label}
        </ListRow>
      ))}
    </nav>
  );
}
