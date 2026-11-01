/**
 * German number, time and weekday formatting.
 *
 * The simulator speaks German on every screen, so figures use the German
 * decimal comma and the simulated wall clock is never re-interpreted through
 * the browser's timezone.
 */

const integerFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const kiloFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WEEKDAY_SHORT: Record<string, string> = {
  montag: "Mo",
  dienstag: "Di",
  mittwoch: "Mi",
  donnerstag: "Do",
  freitag: "Fr",
  samstag: "Sa",
  sonntag: "So",
  monday: "Mo",
  tuesday: "Di",
  wednesday: "Mi",
  thursday: "Do",
  friday: "Fr",
  saturday: "Sa",
  sunday: "So",
  mon: "Mo",
  tue: "Di",
  wed: "Mi",
  thu: "Do",
  fri: "Fr",
  sat: "Sa",
  sun: "So",
};

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(value)) {
    return "–";
  }
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits }).format(value);
}

export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) {
    return "–";
  }
  return integerFormat.format(value);
}

export function formatTemperature(celsius: number): string {
  return `${formatNumber(celsius, 1)} °C`;
}

export function formatHumidity(percent: number): string {
  return `${formatInteger(percent)} %`;
}

export function formatCo2(ppm: number): string {
  return `${formatInteger(ppm)} ppm`;
}

export function formatPower(watts: number): string {
  if (!Number.isFinite(watts)) {
    return "–";
  }
  if (Math.abs(watts) >= 1000) {
    return `${kiloFormat.format(watts / 1000)} kW`;
  }
  return `${formatInteger(watts)} W`;
}

export function formatPowerWatts(watts: number): string {
  return `${formatInteger(watts)} W`;
}

export function formatPercent(value: number): string {
  return `${formatInteger(value)} %`;
}

function clockParts(simTime: string, withSeconds: boolean): string {
  const match = /(?:T|\s)(\d{2}):(\d{2})(?::(\d{2}))?/.exec(simTime);
  if (!match) {
    return withSeconds ? "--:--:--" : "--:--";
  }
  const seconds = withSeconds ? `:${match[3] ?? "00"}` : "";
  return `${match[1]}:${match[2]}${seconds}`;
}

export function formatSimTime(simTime: string): string {
  return clockParts(simTime, false);
}

export function formatSimTimeDetailed(simTime: string): string {
  return clockParts(simTime, true);
}

export function formatWeekdayShort(weekday: string): string {
  const key = weekday.trim().toLowerCase();
  if (WEEKDAY_SHORT[key]) {
    return WEEKDAY_SHORT[key];
  }
  return weekday.trim().slice(0, 2);
}

export function formatWeekday(weekday: string): string {
  return weekday.trim();
}

export function formatClockLabel(simTime: string, weekday: string): string {
  const short = formatWeekdayShort(weekday);
  return short ? `${short} ${formatSimTime(simTime)}` : formatSimTime(simTime);
}
