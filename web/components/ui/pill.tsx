"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const pill = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[999px] text-[13px] leading-none",
  {
    variants: {
      tone: {
        neutral: "border border-rule bg-paper text-ink-2",
        accent: "bg-accent-tint text-accent font-medium",
        live: "bg-live-tint text-live font-medium",
        warn: "bg-warn-tint text-warn font-medium",
        good: "bg-good-tint text-good font-medium",
        bare: "text-ink-3",
      },
      size: {
        sm: "h-6 px-2.5",
        md: "h-7 px-3.5",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface PillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pill> {}

export function Pill({ className, tone, size, ...props }: PillProps) {
  return <span className={cn(pill({ tone, size }), className)} {...props} />;
}

/**
 * DESIGN.md: status is exception-only. A meeting that processed normally shows
 * nothing at all — rendering "Ready" on thirty rows is pure noise. Only these
 * five states are allowed to speak.
 */
export type MeetingState =
  | "recording"
  | "processing"
  | "failed"
  | "waiting"
  | "ok";

const STATE_COPY: Record<
  Exclude<MeetingState, "ok">,
  { label: string; tone: "live" | "warn" | "neutral"; pulse?: boolean }
> = {
  recording: { label: "Recording", tone: "live", pulse: true },
  waiting: { label: "Waiting to be let in", tone: "warn" },
  processing: { label: "Working out who said what", tone: "warn" },
  failed: { label: "Ended early", tone: "neutral" },
};

export function StatusFlag({
  state,
  detail,
  className,
}: {
  state: MeetingState;
  detail?: string;
  className?: string;
}) {
  if (state === "ok") return null;
  const cfg = STATE_COPY[state];
  return (
    <Pill tone={cfg.tone} size="sm" className={className}>
      {cfg.pulse ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {detail ?? cfg.label}
    </Pill>
  );
}
