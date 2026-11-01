import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

export type BannerTone = "info" | "warning" | "error";

export interface BannerProps {
  children: ReactNode;
  tone?: BannerTone;
  className?: string;
}

function InfoIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4m0-4h.01" />
      </g>
    </svg>
  );
}

function AlertIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"
      />
    </svg>
  );
}

export function Banner({ children, tone = "info", className }: BannerProps): ReactElement {
  if (tone === "error") {
    return (
      <p className={cn("error-box", className)} role="alert">
        <AlertIcon />
        <span>{children}</span>
      </p>
    );
  }

  return (
    <p className={cn("note", className)} role={tone === "warning" ? "alert" : undefined}>
      {tone === "warning" ? <AlertIcon /> : <InfoIcon />}
      <span>{children}</span>
    </p>
  );
}
