"use client";

import { cn } from "@/lib/cn";
import { StatusFlag } from "@/components/ui/pill";
import { Participants } from "./speaker";
import { timecode, clockTime, longDate, duration } from "@/lib/speaker";
import type { Meeting } from "./meeting-row";

/**
 * Row and card answer different questions.
 *
 *   Row   "which of my 34 meetings is the one I mean?"
 *         Dense, scannable, title-led. You are travelling through it.
 *
 *   Card  "what happened here, and is it worth opening?"
 *         Gives the recording real presence and shows a line of summary.
 *         Costs roughly 4x the vertical space, so it only pays off where
 *         there are few items and the user is browsing rather than seeking.
 *
 * Use cards for the handful of recent meetings on a home surface, or for
 * search results where a snippet decides the click. Use rows for the archive.
 */
export function MeetingCard({
  meeting,
  onClick,
}: {
  meeting: Meeting;
  onClick?: () => void;
}) {
  const title = meeting.title ?? fallbackTitle(meeting.startedAt, meeting.id);
  const untitled = meeting.title == null;
  const live = meeting.state === "recording";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-lg text-left",
        "border border-rule-lo bg-paper",
        "transition-[border-color,box-shadow] duration-150 ease-out",
        "hover:border-rule hover:shadow-e1",
      )}
    >
      <span className="relative block aspect-video w-full overflow-hidden bg-sunk">
        {meeting.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meeting.poster} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full bg-paper/85",
                "text-ink-2 shadow-e1 transition-transform duration-150 ease-out",
                "group-hover:scale-105",
              )}
            >
              <svg
                viewBox="0 0 12 13"
                className="size-4 translate-x-[1px]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M1.5.8 11 6.5 1.5 12.2z" />
              </svg>
            </span>
          </span>
        )}

        {live ? (
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-xs bg-live px-1.5 py-[3px] text-[10px] font-semibold tracking-[0.04em] text-white uppercase">
            <span className="size-1 rounded-full bg-white" />
            Live
          </span>
        ) : meeting.durationS ? (
          <span className="absolute right-2 bottom-2 rounded-xs bg-ink-1/80 px-1.5 py-[3px] font-mono text-[11px] text-paper">
            {timecode(meeting.durationS)}
          </span>
        ) : null}
      </span>

      <span className="flex flex-col gap-1.5 px-3.5 py-3">
        <span
          className={cn(
            "truncate text-[15px] tracking-[-0.011em]",
            untitled ? "font-normal text-ink-3" : "font-medium text-ink-1",
          )}
        >
          {title}
        </span>

        {/* A card is narrow. When something is wrong with the meeting that
            outranks who was in it, so participants yield rather than truncate
            to "Priya, Marcus and 2 o…". */}
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3">
          {meeting.state !== "ok" ? (
            <>
              <StatusFlag state={meeting.state} detail={meeting.stateDetail} />
              <span className="truncate">{clockTime(meeting.startedAt)}</span>
            </>
          ) : (
            <span className="truncate">
              {clockTime(meeting.startedAt)}
              {meeting.durationS ? ` · ${duration(meeting.durationS)}` : ""}
              {" · "}
              <Participants names={meeting.participants} max={2} />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function fallbackTitle(startedAt: string, id: string): string {
  const label = longDate(startedAt);
  return label ? `Untitled — ${label}` : id;
}
