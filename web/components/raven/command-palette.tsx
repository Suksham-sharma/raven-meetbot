"use client";

import * as React from "react";
import { Command, defaultFilter } from "cmdk";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { clockTime, longDate, people, timecode } from "@/lib/speaker";
import { toRow } from "@/lib/meetings";
import type { MeetingSummary } from "@/lib/types";

export function CommandPalette({
  meetings,
  open,
  onOpenChange,
  onSelect,
}: {
  meetings: MeetingSummary[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (meetingId: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const rows = meetings.map((m) => {
    const row = toRow(m);
    return {
      id: m.id,
      title: row.title ?? fallback(m),
      named: row.title != null,
      when: [longDate(row.startedAt), clockTime(row.startedAt)]
        .filter(Boolean)
        .join(" · "),
      who: people(m.participants),
      length: m.duration_s ? timecode(m.duration_s) : null,
    };
  });

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search everything"
      shouldFilter
      filter={score}
      loop
      overlayClassName={cn(
        "fixed inset-0 z-40 bg-[rgb(35_33_29/0.32)]",
        "motion-safe:animate-[fade_120ms_ease-out]",
      )}
      contentClassName={cn(
        "fixed top-[18vh] left-1/2 z-50 w-[min(620px,calc(100vw-2rem))] -translate-x-1/2",
        "overflow-hidden rounded-xl bg-paper shadow-e3",
        "motion-safe:animate-[pop_160ms_cubic-bezier(0.23,1,0.32,1)]",
      )}
    >
      <div className="flex items-center gap-3 border-b border-rule-lo px-4">
        <MagnifyingGlass size={16} className="shrink-0 text-ink-3" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Find a meeting by name, person or day…"
          className="h-12 w-full bg-transparent text-[15px] text-ink-1 placeholder:text-ink-3 focus:outline-none"
        />
        <kbd className="shrink-0 rounded-xs bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3">
          esc
        </kbd>
      </div>

      <Command.List className="max-h-[46vh] overflow-y-auto overscroll-contain p-2">
        {/* Neutral, never an error: DESIGN.md §7. Reflect the query back and
            state the boundary rather than apologising for it. */}
        <Command.Empty className="px-2 py-6">
          <p className="text-[14px] text-ink-2">
            No meeting matches{" "}
            <span className="text-ink-1">&ldquo;{query}&rdquo;</span>.
          </p>
          <p className="mt-1 text-[12.5px] text-ink-3">
            Searching {meetings.length} loaded meeting
            {meetings.length === 1 ? "" : "s"} by name, person and day. To search
            what was <em>said</em>, ask a question instead.
          </p>
        </Command.Empty>

        {rows.map((row) => (
          <Command.Item
            key={row.id}
            value={row.title}
            keywords={[row.who, row.when]}
            onSelect={() => {
              onOpenChange(false);
              onSelect(row.id);
            }}
            className={cn(
              "flex cursor-pointer items-baseline gap-3 rounded-md px-2.5 py-2.5",
              "transition-colors duration-150 ease-out",
              "data-[selected=true]:bg-accent-tint",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={cn(
                  "truncate text-[14.5px] tracking-[-0.011em]",
                  row.named ? "font-medium text-ink-1" : "font-normal text-ink-3",
                )}
              >
                {row.title}
              </span>
              <span className="truncate text-[12.5px] text-ink-3">
                {[row.when, row.who].filter(Boolean).join(" · ")}
              </span>
            </span>
            {row.length && (
              <span className="shrink-0 font-mono text-[11.5px] text-ink-3 tabular-nums">
                {row.length}
              </span>
            )}
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}

function score(value: string, search: string, keywords: string[] = []): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  if (keywords.some((k) => k.toLowerCase().includes(q))) return 1;
  return defaultFilter?.(value, search) ?? 0;
}

function fallback(m: MeetingSummary): string {
  if (m.participants.length) return people(m.participants);
  const label = m.started_at ? longDate(m.started_at) : "";
  return label ? `Untitled — ${label}` : m.id;
}
