"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

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
        <p className="mt-4 text-[12.5px] text-ink-3">{boundary}</p>
      )}
    </div>
  );
}

export function Processing({
  label = "Working out who said what",
  hint = "Usually a few minutes",
  late,
}: {
  label?: string;
  hint?: string;
  late?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-4 py-3",
        late ? "bg-warn-tint" : "bg-card",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          late ? "bg-warn" : "bg-ink-4 motion-safe:animate-pulse",
        )}
      />
      <span
        className={cn(
          "text-[13.5px] font-medium",
          late ? "text-warn" : "text-ink-2",
        )}
      >
        {late ? "This is taking longer than usual" : label}
      </span>
      <span className="text-[13px] text-ink-3">
        {late ? "You can leave this page — it keeps going" : hint}
      </span>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-rule-lo p-3">
      <div className="aspect-video w-[92px] shrink-0 animate-pulse rounded-md bg-sunk" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Bar className="h-[15px] w-[46%]" />
        <Bar className="h-[13px] w-[64%]" />
      </div>
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xs bg-sunk", className)} />;
}

export interface RefusalAction {
  label: string;
  onClick: () => void;
}

export function Refusal({
  query,
  searched,
  actions,
}: {
  query: string;
  searched: string;
  actions?: RefusalAction[];
}) {
  return (
    <div className="py-2">
      <p className="measure mb-3 font-serif text-[18px] leading-[1.6] font-light">
        Nothing in your meetings mentions{" "}
        <span className="text-ink-1">&ldquo;{query}&rdquo;</span>.
      </p>
      <p className="text-[13px] text-ink-3">{searched}</p>
      {actions && actions.length > 0 && (
        <div className="mt-4 flex gap-2">
          {actions.map((a, i) => (
            <Button
              key={a.label}
              variant={i === 0 ? "secondary" : "quiet"}
              size="sm"
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UngroundedNotice() {
  return (
    <p className="measure mt-3 text-[13px] leading-relaxed text-ink-3">
      Raven couldn&rsquo;t trace this back to a specific moment — read it as a
      summary rather than a quote.
    </p>
  );
}
