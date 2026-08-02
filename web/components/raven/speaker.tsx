"use client";

import { cn } from "@/lib/cn";

/**
 * A speaker is their name. That is the whole component.
 *
 * Three devices were tried here and all cut. Circles-with-initials are the
 * generic SaaS pattern and DESIGN.md forbids icons in coloured circles. A 3px
 * colour bar replaced them and failed the opposite way — at that size eight
 * hues are indistinguishable, so it was decoration encoding nothing. The
 * colours themselves were justified by a timeline ribbon, and the ribbon was
 * cut for clutter.
 *
 * What is left is the thing that was always doing the work: the name.
 */
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

/**
 * Participants as text. A meeting with six people is a sentence, not a row of
 * faces — and the names are what someone actually scans for.
 */
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

  const label =
    names.length > max
      ? `${names.slice(0, max - 1).join(", ")} and ${names.length - (max - 1)} others`
      : names.join(", ");

  return <span className={className}>{label}</span>;
}
