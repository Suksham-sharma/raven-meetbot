"use client";

import { cn } from "@/lib/cn";
import { StatusFlag } from "@/components/ui/pill";
import { Participants } from "./speaker";
import { timecode, clockTime, longDate, duration } from "@/lib/speaker";
import type { Meeting } from "./meeting-row";

export function MeetingCard({
  meeting,
  onClick,
  onRetry,
}: {
  meeting: Meeting;
  onClick?: () => void;
  onRetry?: () => void;
}) {
  const title = meeting.title ?? fallbackTitle(meeting.startedAt, meeting.id);
  const untitled = meeting.title == null;
  const live = meeting.state === "recording";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={cardLabel(meeting, title)}
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

      <span className="flex flex-col gap-1.5 px-3.5 pt-3 pb-3.5">
        <span
          className={cn(
            "truncate text-[15px] tracking-[-0.011em]",
            untitled ? "font-normal text-ink-3" : "font-medium text-ink-1",
          )}
        >
          {title}
        </span>

        {/* The line the card exists for, and the one the row omits — what was
            said, so it is set in serif like every other stretch of speech
            (§4). Two lines, then it yields; the card decides a click, it does
            not reproduce the summary. */}
        {meeting.summary && (
          <span className="line-clamp-2 font-serif text-[14px] leading-[1.5] font-light text-ink-2">
            {meeting.summary}
          </span>
        )}

        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3">
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
        {meeting.state === "failed" && onRetry && (
          <span className="px-3.5 pb-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="rounded-md border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-card"
            >
              Retry
            </button>
          </span>
        )}
      </span>
    </button>
  );
}

function fallbackTitle(startedAt: string, id: string): string {
  const label = longDate(startedAt);
  return label ? `Untitled — ${label}` : id;
}

function cardLabel(m: Meeting, title: string): string {
  return [
    title,
    m.state !== "ok" ? (m.stateDetail ?? m.state) : null,
    clockTime(m.startedAt),
    m.durationS ? duration(m.durationS) : null,
  ]
    .filter(Boolean)
    .join(", ");
}
