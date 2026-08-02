/**
 * Formatting helpers.
 *
 * This file used to carry a speaker-colour system: an FNV-1a hash, eight
 * palette slots, and a collision-resolver so no two people in one meeting
 * shared a hue. All of it existed to feed a timeline ribbon that was cut for
 * being clutter. With the ribbon gone nothing needed colour, because a speaker
 * is written out by name everywhere they appear, so the whole apparatus went
 * rather than sitting here waiting for a use.
 */

/** 872 -> "14:32", 3861 -> "1:04:21" */
export function timecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Dates are formatted by hand, not through Intl.
 *
 * `toLocaleDateString([], …)` resolves the locale from the environment, which
 * is Node's default on the server and the browser's on the client. When those
 * disagree you get a hydration mismatch — "Sunday 2 Aug" server-side against
 * "Sunday, Aug 2" on the client. Explicit tables are deterministic everywhere.
 *
 * Timezone is still the runtime's. Once dates come from the API rather than
 * fixtures, render them against the user's zone explicitly.
 */
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "15:00" — 24-hour, because "03:00 PM" is longer and harder to scan. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** "Sunday, Aug 2" */
export function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** 2530 -> "42 min", 240 -> "4 min", 5400 -> "1 hr 30 min" */
export function duration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
