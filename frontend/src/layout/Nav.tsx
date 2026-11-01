/**
 * Navigation slot of the application shell.
 *
 * Renders the frame's tab bar with the five primary areas of the approved
 * screens. On a phone it sits at the bottom, from 960 px the stylesheet turns
 * it into the rail beside the content.
 */

import type { ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";

type IconName = "house" | "chart" | "bell" | "workflow" | "more";

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Haus", icon: "house" },
  { to: "/history", label: "Verlauf", icon: "chart" },
  { to: "/messages", label: "Meldungen", icon: "bell" },
  { to: "/automations", label: "Regeln", icon: "workflow" },
  { to: "/settings", label: "Mehr", icon: "more" },
];

function NavIcon({ name }: { name: IconName }): ReactElement {
  switch (name) {
    case "house":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </g>
        </svg>
      );
    case "chart":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="m19 9l-5 5l-4-4l-3 3" />
          </g>
        </svg>
      );
    case "bell":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10.268 21a2 2 0 0 0 3.464 0m-10.47-5.674A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
          />
        </svg>
      );
    case "workflow":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <rect width="8" height="8" x="3" y="3" rx="2" />
            <path d="M7 11v4a2 2 0 0 0 2 2h4" />
            <rect width="8" height="8" x="13" y="13" rx="2" />
          </g>
        </svg>
      );
    case "more":
      return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </g>
        </svg>
      );
  }
}

function isCurrent(item: NavItem, pathname: string): boolean {
  if (item.to === "/") {
    return (
      pathname === "/" || pathname.startsWith("/rooms/") || pathname.startsWith("/devices/")
    );
  }
  if (item.to === "/settings") {
    return pathname === "/settings" || pathname.startsWith("/thresholds");
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export interface NavProps {
  openMessages?: number;
  activePath?: string;
  label?: string;
}

export function Nav({
  openMessages,
  activePath,
  label = "Hauptnavigation",
}: NavProps): ReactElement {
  const { pathname } = useLocation();
  const currentPath = activePath ?? pathname;

  return (
    <nav className="tabs" aria-label={label} data-od-id="tabbar">
      {ITEMS.map((item) => {
        const current = isCurrent(item, currentPath);
        const count = item.to === "/messages" ? openMessages : undefined;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="tab"
            aria-current={current ? "page" : undefined}
          >
            <span className="ico">
              <NavIcon name={item.icon} />
              {count && count > 0 ? <span className="count">{count}</span> : null}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
