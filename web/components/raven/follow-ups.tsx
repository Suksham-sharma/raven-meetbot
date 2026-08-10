"use client";

import * as React from "react";
import { CaretDown, Play } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { timecode } from "@/lib/speaker";
import type { OpenAction } from "@/lib/types";

const COLLAPSED = 4;

/**
 * What you owe people, pulled out of the meetings you said it in.
 *
 * DESIGN.md §5 ranks "what I have to do" second of five needs. Two earlier cuts
 * of this missed in opposite directions and both are worth recording, because
 * the fix for one caused the other.
 *
 * The first listed every open commitment in the corpus and put five fields on
 * every row — owner, due, meeting, timecode, text — in a 360px rail. Nothing
 * was dominant, which reads as "no hierarchy" but is really no subordination.
 *
 * The second stripped it to the text and a date. That fixed the noise and lost
 * the product: an action item with no visible provenance is just a to-do, and
 * the whole claim of this thing is that every one traces to a person saying it
 * at a time. Context was gone rather than demoted.
 *
 * So: the row is one loud line, and the evidence sits one click underneath it —
 * the quote, who said it, and the moment, unfolding in place. That is the
 * pattern §7 already sets for citations, and for the same reason: verification
 * should be available rather than insisted upon. One open at a time.
 */
export function FollowUps({
  items,
  me,
  onOpen,
  onToggle,
}: {
  items: OpenAction[];
  /** The signed-in user's name. Without it there is no "yours" to split on. */
  me?: string | null;
  onOpen: (item: OpenAction) => void;
  onToggle?: (item: OpenAction, completed: boolean) => void;
}) {
  const mine = me ? items.filter((i) => isMine(i.owner, me)) : [];
  const theirs = me ? items.filter((i) => !isMine(i.owner, me)) : items;

  if (items.length === 0) return null;

  return (
    <section aria-label="Open follow-ups from your meetings">
      {mine.length > 0 && (
        <Group title="Yours" items={mine} onOpen={onOpen} onToggle={onToggle} />
      )}

      {/* Shut by default. Other people's commitments are context, not your
          list — open, they doubled the height of the rail to answer a question
          nobody came here to ask. */}
      {theirs.length > 0 &&
        (mine.length > 0 ? (
          <Others items={theirs} onOpen={onOpen} onToggle={onToggle} />
        ) : (
          // No session name, or nothing matched it. "Everyone else" needs a
          // first group to be measured against, so this falls back to a flat
          // list under the neutral heading.
          <Group
            title="Follow-ups"
            items={theirs}
            onOpen={onOpen}
            onToggle={onToggle}
            showOwner
          />
        ))}
    </section>
  );
}

function Others({
  items,
  onOpen,
  onToggle,
}: {
  items: OpenAction[];
  onOpen: (item: OpenAction) => void;
  onToggle?: (item: OpenAction, completed: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "mt-5 -ml-2 flex min-h-6 items-center gap-1.5 rounded-md px-2 py-1",
          "text-[12.5px] text-ink-3",
          "transition-colors duration-150 ease-out hover:bg-card hover:text-ink-1",
        )}
      >
        <CaretDown size={11} weight="bold" />
        {items.length} more, owed by other people
      </button>
    );
  }

  return (
    <Group
      title="Everyone else"
      items={items}
      onOpen={onOpen}
      onToggle={onToggle}
      showOwner
      collapsible
      className="mt-6"
    />
  );
}

function Group({
  title,
  items,
  onOpen,
  onToggle,
  showOwner,
  collapsible,
  className,
}: {
  title: string;
  items: OpenAction[];
  onOpen: (item: OpenAction) => void;
  onToggle?: (item: OpenAction, completed: boolean) => void;
  showOwner?: boolean;
  collapsible?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  // One open at a time, same as EvidenceFootnote — several quotes unfolded at
  // once in a rail this narrow is the wall of serif §7 rejected.
  const [open, setOpen] = React.useState<number | null>(null);

  const shown = collapsible && !expanded ? items.slice(0, COLLAPSED) : items;
  const rest = items.length - shown.length;

  return (
    <div className={className}>
      <h2 className="mb-2 text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
        {title}
      </h2>

      <ul className="-mx-2 flex flex-col gap-px">
        {shown.map((item) => (
          <Row
            key={item.id}
            item={item}
            showOwner={showOwner}
            open={open === item.id}
            onOpenChange={(v) => setOpen(v ? item.id : null)}
            onJump={() => onOpen(item)}
            onToggle={onToggle && ((v) => onToggle(item, v))}
          />
        ))}
      </ul>

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "mt-2 -ml-2 min-h-6 rounded-md px-2 py-1 text-[12.5px] text-ink-3",
            "transition-colors duration-150 ease-out hover:bg-card hover:text-ink-1",
          )}
        >
          Show {rest} more
        </button>
      )}
    </div>
  );
}

function Row({
  item,
  showOwner,
  open,
  onOpenChange,
  onJump,
  onToggle,
}: {
  item: OpenAction;
  showOwner?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: () => void;
  onToggle?: (completed: boolean) => void;
}) {
  const done = item.completed_at != null;
  const meta = [showOwner ? item.owner : null, item.due].filter(Boolean);

  return (
    <li>
      {/* The checkbox cannot live inside the disclosure button — nested
          interactives are invalid and the screen reader announces one control
          where there are two. They sit side by side and the hover treatment is
          carried by the wrapper, so the row still reads as one object. */}
      {/* The tint moves to the whole li when open, so the row and the quote
          under it read as one object. Left on the row alone it made a card with
          text floating beneath, which is what the border was there to paper
          over — and a bar down the side of a card is the pattern §8 forbids by
          name. Space binds them instead. */}
      <div
        className={cn(
          "rounded-md transition-colors duration-150 ease-out",
          open && "bg-card",
        )}
      >
        <div
          className={cn(
            "group flex items-start gap-2.5 rounded-md px-2 py-2",
            "transition-colors duration-150 ease-out",
            !open && "hover:bg-card",
          )}
        >
        <span className="pt-[3px]">
          <Checkbox
            checked={done}
            onCheckedChange={onToggle}
            disabled={!onToggle}
            aria-label={`Done: ${item.text}`}
          />
        </span>

        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-label={`${item.text}${meta.length ? `, ${meta.join(", ")}` : ""}, show what was said`}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block text-[14.5px] leading-[1.45]",
                done
                  ? "text-ink-3 line-through decoration-ink-4/60"
                  : "text-ink-1",
              )}
            >
              {item.text}
            </span>
            {meta.length > 0 && !done && (
              <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                {showOwner && item.owner && (
                  <span className="font-medium text-ink-2">{item.owner}</span>
                )}
                {showOwner && item.owner && item.due && (
                  <span className="text-ink-4"> · </span>
                )}
                {item.due}
              </span>
            )}
          </span>

          {/* The affordance that says there is more behind this row. Visible at
              all times rather than on hover — a control that only exists under
              a pointer is invisible on touch and unreachable by keyboard. */}
          <CaretDown
            size={12}
            weight="bold"
            aria-hidden
            className={cn(
              "mt-1 shrink-0 text-ink-4",
              "transition-[transform,color] duration-150 ease-out",
              "group-hover:text-ink-3",
              open && "rotate-180 text-ink-2",
            )}
          />
        </button>
      </div>

        {open && (
          // Aligned to the row's text, not to its edge: checkbox + gap + the
          // row's own padding. The quote reads as a continuation of the line
          // above rather than a new block starting further left.
          <div className="pr-2 pb-2 pl-[35px]">
            {/* A step down from the commitment, where it used to match it —
                two things the same size are two headlines. Serif and italic
                because it is speech, the rule that sets every quote in the
                product. */}
            <q className="block font-serif text-[13.5px] leading-[1.5] font-light text-ink-2 italic [quotes:none]">
              {item.evidence_quote}
            </q>

            {/* One control rather than three fragments sitting near each
                other. The glyph and the timecode lead because they are the
                action and they must never truncate; the meeting is last
                because it is the part you can afford to lose at this width. */}
            <button
              type="button"
              onClick={onJump}
              aria-label={`Play ${item.speaker ?? "this moment"} at ${timecode(item.start_s)}`}
              className={cn(
                "mt-1.5 -ml-1 flex min-h-6 max-w-full items-center gap-1.5",
                "rounded-sm px-1 py-0.5 text-[11.5px] text-ink-3",
                "transition-colors duration-150 ease-out hover:bg-sunk hover:text-accent",
              )}
            >
              <Play size={9} weight="fill" className="shrink-0" />
              <span className="shrink-0 font-mono tabular-nums">
                {timecode(item.start_s)}
              </span>
              {item.speaker && (
                <>
                  <Sep />
                  <span className="shrink-0 font-medium">{item.speaker}</span>
                </>
              )}
              {item.meeting_title && (
                <>
                  <Sep />
                  <span className="truncate">{item.meeting_title}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function Sep() {
  return (
    <span aria-hidden className="shrink-0 text-ink-4">
      ·
    </span>
  );
}

// Owners are display names lifted from the transcript, so this is a name match
// or nothing — there is no id to join on. Strict on purpose: calling someone
// else's commitment yours is a worse failure than never saying it. A miss is
// now visible rather than silent — an unmatched item lands under "Everyone
// else" instead of just losing a bold word.
function isMine(owner: string | null, me?: string | null): boolean {
  if (!owner || !me) return false;
  const o = owner.trim().toLowerCase();
  const full = me.trim().toLowerCase();
  return o === full || o === full.split(/\s+/)[0];
}
