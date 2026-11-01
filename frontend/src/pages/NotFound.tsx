/**
 * Fallback screen for an address the app does not know.
 *
 * The route is rendered inside the application shell, so the simulated clock,
 * the seed and the navigation stay visible instead of leaving an empty page.
 * The German hint and the link back to the overview keep the frame a place the
 * visitor can leave again.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { EmptyState, PageHead, View } from "../ui";

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

export function NotFound(): ReactElement {
  return (
    <View>
      <PageHead
        title="Seite nicht gefunden"
        description="Diese Adresse gehört nicht zum SmartHomeCenter."
      />
      <EmptyState as="div">
        Diese Seite gibt es nicht. Vielleicht ist die Adresse falsch geschrieben oder die Seite
        wurde entfernt.
      </EmptyState>
      <Link className="btn-secondary" to="/">
        <BackIcon />
        Zur Hausübersicht
      </Link>
    </View>
  );
}
