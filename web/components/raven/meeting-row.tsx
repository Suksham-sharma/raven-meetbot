"use client";

import { Play } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { StatusFlag, type MeetingState } from "@/components/ui/pill";
import { timecode, clockTime, longDate, duration } from "@/lib/speaker";

export interface Meeting {
  id: string;
  title: string | null;
  startedAt: string;
  durationS: number | null;
  participants: string[];
  state: MeetingState;
  stateDetail?: string;
  /** One line of what happened. The card shows it; the row ignores it. */
  summary?: string | null;
  poster?: string;
}

export function MeetingRow({
  meeting,
  selected,
  onClick,
}: {
  meeting: Meeting;
  selected?: boolean;
  onClick?: () => void;
}) {
  const title = meeting.title ?? fallbackTitle(meeting);
  const untitled = meeting.title == null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      aria-label={rowLabel(meeting, title)}
      className={cn(
        "group flex w-full items-center gap-4 rounded-md p-3 text-left",
        "transition-colors duration-150 ease-out",
        "hover:bg-card",
        selected && "bg-accent-tint",
      )}
    >
      <span aria-hidden="true" className="contents">
        <Thumb meeting={meeting} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-[15.5px] tracking-[-0.011em]",
            untitled ? "font-normal text-ink-3" : "font-medium text-ink-1",
          )}
        >
          {title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
          {meeting.state !== "ok" && (
            <>
              <StatusFlag state={meeting.state} detail={meeting.stateDetail} />
              <span className="text-ink-3 opacity-50">·</span>
            </>
          )}
          <span className="truncate">{secondary(meeting)}</span>
        </span>
      </span>
    </button>
  );
}

function Thumb({ meeting }: { meeting: Meeting }) {
  const live = meeting.state === "recording";

  return (
    <span
      className={cn(
        "relative block aspect-video w-[92px] shrink-0 overflow-hidden rounded-md",
        "bg-sunk ring-1 ring-rule/70",
      )}
    >
      {meeting.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meeting.poster} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center">
          <span
            className={cn(
              "grid size-7 place-items-center rounded-full bg-paper/85",
              "text-ink-2 shadow-e1 transition-transform duration-150 ease-out",
              "group-hover:scale-105",
            )}
          >
            <Play size={12} weight="fill" />
          </span>
        </span>
      )}

      {/* Duration as an overlay badge, the way every video product does it —
          which keeps it out of the metadata line. */}
      {live ? (
        <span className="absolute right-1 bottom-1 flex items-center gap-1 rounded-xs bg-live px-1.5 py-[2px] text-[9.5px] font-semibold tracking-[0.04em] text-white uppercase">
          <span className="size-1 rounded-full bg-white" />
          Live
        </span>
      ) : meeting.durationS ? (
        <span className="absolute right-1 bottom-1 rounded-xs bg-ink-1/80 px-1.5 py-[2px] font-mono text-[10px] text-paper">
          {timecode(meeting.durationS)}
        </span>
      ) : null}
    </span>
  );
}

// Untitled rows put the people in the title, so repeating them here would say
// the same thing twice and leave the row with nothing that identifies it.
function secondary(m: Meeting): string {
  return m.title == null
    ? clockTime(m.startedAt)
    : [clockTime(m.startedAt), people(m)].filter(Boolean).join(" · ");
}

// Rows sit under a day heading, so a date here repeats the group it is in. Who
// was in the call is the most useful thing left, and it stays in tertiary ink
// so it never reads as a real name someone gave the meeting.
function fallbackTitle(m: Meeting): string {
  if (m.participants.length) return people(m);
  const label = longDate(m.startedAt);
  return label ? `Untitled — ${label}` : m.id;
}

// Content order puts the duration badge first, so the computed name comes out
// as "42:30suksham, Ankur Singh21:07". Spell it instead.
function rowLabel(m: Meeting, title: string): string {
  return [
    title,
    m.state !== "ok" ? (m.stateDetail ?? m.state) : null,
    clockTime(m.startedAt),
    m.durationS ? duration(m.durationS) : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function people(m: Meeting): string {
  return m.participants.length > 3
    ? `${m.participants.slice(0, 2).join(", ")} and ${m.participants.length - 2} others`
    : m.participants.join(", ");
}

export function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-9 mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase first:mt-0">
      {children}
    </h2>
  );
}
