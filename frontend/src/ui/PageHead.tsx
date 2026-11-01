import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "../lib/cn";

export interface PageHeadCrumb {
  to: string;
  label: string;
}

export interface PageHeadProps {
  title: ReactNode;
  description?: ReactNode;
  crumb?: PageHeadCrumb;
  name?: ReactNode;
  variant?: "page" | "room";
  className?: string;
  id?: string;
}

function BackIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m12 19l-7-7l7-7m7 7H5"
      />
    </svg>
  );
}

export function PageHead({
  title,
  description,
  crumb,
  name,
  variant = "page",
  className,
  id,
}: PageHeadProps): ReactElement {
  return (
    <>
      {crumb ? (
        <Link className="crumb" to={crumb.to}>
          <BackIcon />
          {crumb.label}
        </Link>
      ) : null}
      <div
        id={id}
        className={cn("pagehead", variant === "room" && "roomhead", className)}
      >
        {name ? <span className="name nm">{name}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
    </>
  );
}
