"use client";

import { cn } from "@/lib/cn";
import { StatusFlag, type MeetingState } from "@/components/ui/pill";
import { timecode, clockTime, longDate } from "@/lib/speaker";

export interface Meeting {
  id: string;
  /** Null for every real meeting — the backend never sets it. Fall back. */
  title: string | null;
  startedAt: string;
  durationS: number | null;
  participants: string[];
  state: MeetingState;
  stateDetail?: string;
  /** Frame from the recording. Absent until the pipeline has produced one. */
  poster?: string;
}

/**
 * DESIGN.md: two things per row — title, then one line.
 *
 * The thumbnail carries the duration as an overlay badge the way every video
 * product does, which takes it out of the metadata line. An avatar stack was
 * tried here and cut: it made the row say three things at once, and faces at
 * 23px are decoration rather than information.
 */
export function MeetingRow({
  meeting,
  selected,
  onClick,
}: {
  meeting: Meeting;
  selected?: boolean;
  onClick?: () => void;
}) {
  const title = meeting.title ?? fallbackTitle(meeting.id, meeting.startedAt);
  const untitled = meeting.title == null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-md p-2.5 text-left",
        "border-b border-rule-lo transition-colors duration-150 ease-out",
        "hover:bg-card",
        selected && "bg-card",
      )}
    >
      <Thumb meeting={meeting} />

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
              <span className="text-ink-4 opacity-50">·</span>
            </>
          )}
          <span className="truncate">{secondary(meeting)}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * 16:9, sized so a row stays scannable. Shows the recording frame once one
 * exists; until then a neutral well rather than a decorative gradient.
 */
function Thumb({ meeting }: { meeting: Meeting }) {
  const live = meeting.state === "recording";

  return (
    <span
      className={cn(
        "relative block aspect-video w-[76px] shrink-0 overflow-hidden rounded-sm",
        "bg-sunk ring-1 ring-rule/70",
      )}
    >
      {meeting.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={meeting.poster} alt="" className="size-full object-cover" />
      ) : (
        // No frame yet. A warm well with a clear play mark reads as "video,
        // no preview"; the dark box with a faint glyph it replaced read as a
        // broken image.
        <span className="grid size-full place-items-center">
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full bg-paper/80",
              "text-ink-2 shadow-e1 transition-transform duration-150 ease-out",
              "group-hover:scale-105",
            )}
          >
            <svg
              viewBox="0 0 12 13"
              className="size-2.5 translate-x-[0.5px]"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M1.5.8 11 6.5 1.5 12.2z" />
            </svg>
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

function secondary(m: Meeting): string {
  const people =
    m.participants.length > 3
      ? `${m.participants.slice(0, 2).join(", ")} and ${m.participants.length - 2} others`
      : m.participants.join(", ");

  return [clockTime(m.startedAt), people].filter(Boolean).join(" · ");
}

/** `kdz-mrqa-fhi_2026-07-29_15-00-00` is not a title. A date is. */
function fallbackTitle(id: string, startedAt: string): string {
  const label = longDate(startedAt);
  return label ? `Untitled — ${label}` : id;
}

/** Day grouping header for the meetings list. */
export function DayHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-9 mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.1em] text-ink-4 uppercase first:mt-0">
      {children}
    </h2>
  );
}
