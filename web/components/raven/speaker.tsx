"use client";

import { cn } from "@/lib/cn";
import { people } from "@/lib/speaker";

export function SpeakerName({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-semibold text-ink-2",
        size === "sm" ? "text-[12.5px]" : "text-[13px]",
        className,
      )}
    >
      {name}
    </span>
  );
}

export function Participants({
  names,
  max = 3,
  className,
}: {
  names: string[];
  max?: number;
  className?: string;
}) {
  if (names.length === 0) return null;
  return <span className={className}>{people(names, max)}</span>;
}
