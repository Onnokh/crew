/** Shared date/time formatting for the dashboard surfaces. */

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

export const SHORT_TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** A short "Jun 21"-style date for a unix-ms timestamp. */
export function shortDate(timestamp: number): string {
  return SHORT_DATE.format(new Date(timestamp));
}

/** A part/whole as an integer percentage (0 when the whole is 0). */
export function ratePct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** Compact "just now / 5m / 3h / 2d" relative to now; falls back to a short date past a week. */
export function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(timestamp);
}
