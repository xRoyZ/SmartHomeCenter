import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "../lib/cn";

export interface ListRowProps {
  children: ReactNode;
  hint?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function ListRow({
  children,
  hint,
  to,
  href,
  onClick,
  disabled = false,
  className,
}: ListRowProps): ReactElement {
  const content = (
    <>
      {children}
      {hint ? <span>{hint}</span> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={cn("listrow-button", className)}
        onClick={onClick}
        disabled={disabled}
      >
        {content}
      </button>
    );
  }

  return <div className={cn("listrow-static", className)}>{content}</div>;
}
