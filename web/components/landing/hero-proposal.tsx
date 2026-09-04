"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type Phase = "proposed" | "pressing" | "executing" | "executed";

const SCRIPT: Array<[Phase, number]> = [
  ["pressing", 2200],
  ["executing", 2400],
  ["executed", 3600],
];

export function HeroProposal() {
  const [phase, setPhase] = React.useState<Phase>("proposed");

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers = SCRIPT.map(([next, at]) =>
      window.setTimeout(() => setPhase(next), at),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const settled = phase === "executed";

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-3">
      <div
        className={cn(
          "rounded-xl p-5 shadow-e3 transition-colors duration-200 ease-out sm:p-6",
          settled ? "border border-rule-lo bg-paper" : "bg-accent-tint",
        )}
      >
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <p className="text-[13px] text-ink-2">Linear issue · Platform</p>
          {settled && (
            <span className="hero-pill inline-flex h-6 items-center rounded-[999px] bg-good-tint px-2.5 text-[13px] leading-none font-medium text-good">
              PLT-214
            </span>
          )}
        </div>
        <p
          className={cn(
            "mb-3 font-serif text-[21px] leading-[1.25] tracking-[-0.012em] text-balance transition-colors duration-200",
            settled && "text-ink-3",
          )}
        >
          Rate-limit the ingest endpoint before pilot traffic
        </p>
        <p
          className={cn(
            "text-[13px] transition-colors duration-200",
            settled ? "text-ink-3" : "text-ink-2",
          )}
        >
          {settled ? "Filed for Dev, due Thursday" : "Dev took it for Thursday"}
          {" — because of what Priya said at "}
          <span className={cn("font-mono", !settled && "text-accent")}>
            22:07
          </span>
        </p>

        <div
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out",
            settled
              ? "mt-0 grid-rows-[0fr] opacity-0"
              : "mt-5 grid-rows-[1fr] opacity-100",
          )}
        >
          <div className="flex min-h-0 flex-wrap items-center gap-2 overflow-hidden">
            <Button
              variant="primary"
              loading={phase === "executing"}
              tabIndex={-1}
              aria-hidden
              className={cn(
                "transition-transform duration-150",
                phase === "pressing" && "scale-[0.96]",
              )}
            >
              {phase === "executing" ? "Filing it" : "Approve"}
            </Button>
            <Button variant="secondary" tabIndex={-1} aria-hidden>
              Play the moment
            </Button>
            <Button variant="quiet" className="ml-auto" tabIndex={-1} aria-hidden>
              Dismiss
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-accent-tint p-5 shadow-e2 sm:p-6">
        <p className="mb-1.5 text-[13px] text-ink-2">Message to #design</p>
        <p className="mb-3 font-serif text-[21px] leading-[1.25] tracking-[-0.012em] text-balance">
          Pilot start moved to the 14th. Timeline doc is updated.
        </p>
        <p className="text-[13px] text-ink-2">
          Raven would like to post this — because of what Anya said at{" "}
          <span className="font-mono text-accent">12:04</span>
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" tabIndex={-1} aria-hidden>
            Approve
          </Button>
          <Button variant="secondary" tabIndex={-1} aria-hidden>
            Play the moment
          </Button>
          <Button variant="quiet" className="ml-auto" tabIndex={-1} aria-hidden>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
