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
          {item.mine && (
            <span className="ml-2 inline-flex h-[17px] items-center rounded-[999px] bg-accent px-2 align-[1px] text-[10.5px] font-semibold tracking-[0.03em] text-accent-ink">
              You
            </span>
          )}
        </span>

        <span className="text-[12.5px] text-ink-3">
          {[item.owner, item.due].filter(Boolean).join(" · ")}
          {(item.owner || item.due) && " · "}
          <button
            type="button"
            onClick={onJump}
            className="font-mono text-accent hover:underline"
          >
            {timecode(item.at)}
          </button>
        </span>
      </span>
    </div>
  );
}
