import type { Meeting } from "@/components/raven/meeting-row";
import type { MeetingState } from "@/components/ui/pill";
import type { Corpus, MeetingSummary } from "./types";
import { longDate, shortDate } from "./speaker";

/** "34 meetings · 3 Jan – 2 Aug" — DESIGN.md §7 wants the boundary stated. */
export function corpusLabel(c: Corpus): string {
  const count = `${c.total} meeting${c.total === 1 ? "" : "s"}`;
  const from = c.from ? shortDate(c.from) : "";
  const to = c.to ? shortDate(c.to) : "";
  if (!from || !to) return count;
  return from === to ? `${count} · ${from}` : `${count} · ${from} – ${to}`;
}

// meetings.status only ever holds pending or ingested, and ingest creates the
// row — so anything that isn't pending is simply done, and unknown values fall
// through to no badge rather than crashing.
export function meetingState(m: MeetingSummary): MeetingState {
  return m.status === "pending" ? "processing" : "ok";
}

export function toRow(m: MeetingSummary): Meeting {
  return {
    id: m.id,
    title: m.title,
    startedAt: m.started_at ?? "",
    durationS: m.duration_s,
    participants: m.participants,
    state: meetingState(m),
  };
}

export interface DayGroup {
  key: string;
  label: string;
  meetings: MeetingSummary[];
}

export function groupByDay(meetings: MeetingSummary[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const m of meetings) {
    const key = dayKey(m.started_at);
    const last = groups.at(-1);
    if (last?.key === key) last.meetings.push(m);
    else groups.push({ key, label: dayLabel(m.started_at), meetings: [m] });
  }
  return groups;
}

function dayKey(iso: string | null): string {
  if (!iso) return "undated";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "undated" : d.toDateString();
}

function dayLabel(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date";

  const today = new Date();
  const days = Math.round(
    (startOfDay(today).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return longDate(iso);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
