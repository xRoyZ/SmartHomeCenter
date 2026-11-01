/**
 * Thresholds screen.
 *
 * The page frame around the `limits` region: the shared page head, the
 * consequence notice and the link to the messages list. The editable region
 * itself lives in `features/thresholds/ThresholdPanel`.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { ThresholdPanel } from "../features/thresholds/ThresholdPanel";
import { Banner, PageHead, View } from "../ui";

function ArrowIcon(): ReactElement {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M5 12h14m-7-7l7 7l-7 7"
      />
    </svg>
  );
}

export function Thresholds(): ReactElement {
  return (
    <View>
      <PageHead
        crumb={{ to: "/settings", label: "Mehr" }}
        title="Schwellwerte"
        description="Ab diesen Grenzen meldet sich das Haus von selbst."
      />

      <ThresholdPanel />

      <Banner>Gilt sofort für neu entstehende Meldungen</Banner>

      <Link className="btn-primary" to="/messages" data-od-id="open-messages">
        Meldungen ansehen
        <ArrowIcon />
      </Link>
    </View>
  );
}
