"use client";

import * as React from "react";
import { Play } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/speaker";

export interface Source {
  speaker: string;
  at: number;
  quote: string;
  where?: string;
  clipLength?: number;
}

export function CitationChip({
  speaker,
  at,
  open,
  onClick,
  className,
}: {
  speaker: string;
  at: number;
  open?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${speaker}, ${timecode(at)}, show what they said`}
      className={cn(
        "relative inline-flex h-[22px] items-center gap-1.5 rounded-[999px] px-2",
        "before:absolute before:-inset-y-[3px] before:inset-x-0 before:content-['']",
        "align-[1px] text-[12px] font-medium transition-colors duration-150 ease-out",
        open
          ? "bg-accent text-accent-ink"
          : "bg-accent-tint text-accent hover:bg-accent-line",
        className,
      )}
    >
      {speaker}
      <span className="font-mono text-[11px] opacity-70">{timecode(at)}</span>
    </button>
  );
}

export function EvidenceFootnote({
  sources,
  onPlay,
  children,
}: {
  sources: Source[];
  onPlay?: (s: Source) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState<number | null>(null);
  const current = open === null ? null : sources[open];

  return (
    <div>
      <div className="measure font-serif text-[16.5px] leading-[1.65] font-light">
        {children}
      </div>

      {/* Their own row rather than trailing the last line. Inline, the chips
          ran on from the final sentence and then wrapped mid-run — at rail
          width that happens almost every time, and it read as the prose
          continuing into UI chrome. A footnote sits under the text; it does
          not finish the paragraph. */}
      {sources.length > 0 && (
        <div className="measure mt-2.5 flex flex-wrap gap-1.5">
          {sources.map((s, i) => (
            <CitationChip
              key={i}
              speaker={s.speaker}
              at={s.at}
              open={open === i}
              onClick={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>
      )}

      {current && (
        <div className="measure mt-3 border-l-2 border-accent-line pl-4">
          <q className="mb-1.5 block font-serif text-[15.5px] leading-[1.55] font-light text-ink-2 italic [quotes:none]">
            {current.quote}
          </q>
          <button
            type="button"
            onClick={() => onPlay?.(current)}
            aria-label={`Play ${current.speaker} at ${timecode(current.at)}`}
            className="-my-1 inline-flex min-h-6 items-center gap-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:text-accent"
          >
            <Play size={11} weight="fill" />
            Play
            {current.clipLength != null && ` ${timecode(current.clipLength)}`}
          </button>
        </div>
      )}
    </div>
  );
}
