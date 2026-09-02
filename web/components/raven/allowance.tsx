"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/queries";
import type { MeetingUsage } from "@/lib/types";

export interface Allowance extends MeetingUsage {
  limit: number;
  exhausted: boolean;
}

export function useAllowance(): Allowance | null {
  const { data } = useSession();
  const usage = data?.usage;
  if (!usage || usage.limit === null) return null;
  return { ...usage, limit: usage.limit, exhausted: usage.used >= usage.limit };
}

function freeMeetings(limit: number): string {
  return `${limit} free ${limit === 1 ? "meeting" : "meetings"}`;
}

export function AllowanceLine({ className }: { className?: string }) {
  const allowance = useAllowance();
  if (!allowance) return null;
  return (
    <p className={cn("text-[12.5px] text-ink-3", className)}>
      {allowance.exhausted
        ? `You've used your ${freeMeetings(allowance.limit)}.`
        : `${allowance.used} of ${freeMeetings(allowance.limit)} used.`}
    </p>
  );
}

export function AllowanceReached({
  limit,
  onDone,
}: {
  limit: number;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-serif text-[19px] leading-tight tracking-[-0.012em]">
          You&rsquo;ve used your {freeMeetings(limit)}.
        </p>
        <p className="measure mt-2 text-[14px] leading-relaxed text-ink-2">
          Raven keeps everything it recorded. You can still open those meetings,
          search them, and ask about what was said.
        </p>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
