import type { ReactElement } from "react";

import { cn } from "../lib/cn";
import { formatSimTime, formatWeekday, formatWeekdayShort } from "../lib/format";

export interface SimClockProps {
  simTime: string;
  weekday: string;
  className?: string;
}

export function SimClock({ simTime, weekday, className }: SimClockProps): ReactElement {
  const time = formatSimTime(simTime);
  const day = formatWeekdayShort(weekday);
  const label = `Simulierte Uhrzeit ${formatWeekday(weekday)} ${time}`.replace(/\s+/g, " ").trim();

  return (
    <div className={cn("clock", className)} aria-label={label}>
      <span className="day">{day}</span>
      <span>{time}</span>
    </div>
  );
}
