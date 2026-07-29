"use client";

import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { timecode } from "@/lib/speaker";

export interface ActionItem {
  id: number;
  text: string;
  owner: string | null;
  /** Free text as spoken ("end of week"). Not a date — never parse it. */
  due: string | null;
  at: number;
  mine?: boolean;
  done?: boolean;
}

export function TaskRow({
  item,
  onToggle,
  onJump,
}: {
  item: ActionItem;
  onToggle?: (v: boolean) => void;
  onJump?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-rule-lo py-3.5 first:border-0">
      <span className="pt-[3px]">
        <Checkbox
          checked={item.done}
          onCheckedChange={onToggle}
          aria-label={item.text}
        />
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-[15px] leading-[1.45]",
            item.done && "text-ink-3 line-through decoration-ink-4/50",
          )}
        >
          {item.text}
        </span>

        {/* "You" is an owner, so it goes in the owner slot. It used to be a
            solid accent pill spliced into the task text, which made ownership
            the loudest thing in the row — louder than the timecode, the only
            control here — and left the owner slot empty on exactly the rows
            that mattered most. Weight carries it instead of colour. */}
        <span className="text-[12.5px] text-ink-3">
          {item.mine ? (
            <span className="font-medium text-ink-2">You</span>
          ) : (
            item.owner
          )}
          {(item.mine || item.owner) && item.due ? " · " : null}
          {item.due}
          {(item.mine || item.owner || item.due) && " · "}
          <button
            type="button"
            onClick={onJump}
            aria-label={`Jump to ${timecode(item.at)}, where this was said`}
            className="-my-1 inline-block py-1 font-mono text-accent hover:underline"
          >
            {timecode(item.at)}
          </button>
        </span>
      </span>
    </div>
  );
}
