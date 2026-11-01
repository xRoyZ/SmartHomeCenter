/**
 * Shared pause/resume icons.
 *
 * The house overview and the settings screen both control the simulation clock,
 * so the playback icons live here once instead of in each screen.
 */

import type { ReactElement } from "react";

export function PauseIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <rect width="5" height="18" x="14" y="3" rx="1" />
        <rect width="5" height="18" x="5" y="3" rx="1" />
      </g>
    </svg>
  );
}

export function PlayIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m6 3l14 9l-14 9z"
      />
    </svg>
  );
}
