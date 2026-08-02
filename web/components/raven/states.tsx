"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

/**
 * DESIGN.md: empty and refusal states are neutral, never errors. No red, no
 * warning triangle, no sad illustration. Reflect the query back, state the
 * search boundary, offer the next move. A refusal styled like an error reads
 * as a bug in the product rather than an honest answer.
 */
export function EmptyState({
  title,
  body,
  action,
  boundary,
  className,
}: {
  title: string;
  body?: string;
  action?: { label: string; onClick?: () => void };
  boundary?: string;
  className?: string;
}) {
  return (
    <div className={cn("py-10", className)}>
      <p className="mb-2 font-serif text-[21px] leading-tight tracking-[-0.012em]">
        {title}
      </p>
      {body && (
        <p className="measure mb-4 text-[14.5px] leading-relaxed text-ink-2">
          {body}
        </p>
      )}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {boundary && (
        <p className="mt-4 text-[12.5px] text-ink-4">{boundary}</p>
      )}
    </div>
  );
}

/**
 * The pipeline between "bot left the call" and "meeting is queryable" is
 * completely unobservable — meetings.status only ever holds pending or
 * ingested. So this is honestly indeterminate. Never fake a progress bar for
 * something with no progress signal.
 */
export function Processing({
  label = "Working out who said what",
  hint = "Usually a few minutes",
}: {
  label?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-warn-tint px-4 py-3">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-warn" />
      </span>
      <span className="text-[13.5px] font-medium text-warn">{label}</span>
      <span className="text-[13px] text-ink-3">{hint}</span>
    </div>
  );
}

/** Shape-matched skeletons. A spinner tells you nothing about what's coming. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-rule-lo px-3 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bar className="h-[15px] w-[46%]" />
        <Bar className="h-[13px] w-[64%]" />
      </div>
      <div className="flex">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "size-[22px] animate-pulse rounded-full bg-sunk ring-[1.5px] ring-paper",
              i > 0 && "-ml-1.5",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xs bg-sunk", className)} />;
}

/** Neutral, not red. `refused: true` comes back as HTTP 200. */
export function Refusal({
  query,
  searched,
}: {
  query: string;
  searched: string;
}) {
  return (
    <div className="py-2">
      <p className="measure mb-3 font-serif text-[18px] leading-[1.6] font-light">
        Nothing in your meetings mentions{" "}
        <span className="text-ink-1">&ldquo;{query}&rdquo;</span>.
      </p>
      <p className="text-[13px] text-ink-4">{searched}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm">
          Widen the date range
        </Button>
        <Button variant="quiet" size="sm">
          Connect more calendars
        </Button>
      </div>
    </div>
  );
}

/**
 * `grounded: false` means the model made claims it could not tie to a source.
 * The API returns it as a normal 200 with the answer intact and leaves the
 * call to us. Showing it with a visible caveat beats hiding it.
 */
export function UngroundedNotice() {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-md border border-warn/25 bg-warn-tint px-3.5 py-2.5">
      <svg
        viewBox="0 0 16 16"
        className="mt-[3px] size-3.5 shrink-0 text-warn"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 4.75v3.75M8 11.1v.05" strokeLinecap="round" />
      </svg>
      <p className="text-[13px] leading-relaxed text-ink-2">
        Raven couldn&rsquo;t trace this answer back to a specific moment. Treat
        it as a summary rather than a quote.
      </p>
    </div>
  );
}
