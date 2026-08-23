"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { useStopBot } from "@/lib/queries";
import { cn } from "@/lib/cn";
import type { BotState, BotSummary } from "@/lib/types";

export function LiveSessions({ bots }: { bots: BotSummary[] }) {
  if (bots.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {bots.map((bot) => (
        <li key={bot.jobId}>
          <LiveSession bot={bot} />
        </li>
      ))}
    </ul>
  );
}

function LiveSession({ bot }: { bot: BotSummary }) {
  const [confirming, setConfirming] = React.useState(false);
  const stop = useStopBot();
  const elapsed = useElapsed(bot.createdAt);
  const { label, live } = describe(bot.status);

  function confirmStop() {
    stop.mutate(bot.jobId, {
      onSuccess: ({ status }) => {
        setConfirming(false);
        toast.success(
          status === "cancelled"
            ? "Bot cancelled before it joined."
            : "Raven is leaving the call.",
          { description: "The recording so far is kept and will be processed." },
        );
      },
      onError: (error) => {
        setConfirming(false);
        toast.error("Couldn't stop the bot.", {
          description: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border px-4 py-3.5",
        live ? "border-live/35 bg-live-tint" : "border-rule bg-card",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          {live && (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-live"
            />
          )}
          <span className="truncate text-[14.5px] text-ink-1">{label}</span>
        </span>
        <span className="truncate text-[12.5px] text-ink-3">
          {meetCode(bot.meetingUrl)}
          {elapsed ? ` · ${elapsed}` : ""}
        </span>
      </span>

      <Button
        variant="secondary"
        size="sm"
        disabled={bot.status === "stopping"}
        onClick={() => setConfirming(true)}
      >
        {bot.status === "stopping" ? "Stopping…" : "Stop"}
      </Button>

      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title="Stop recording?"
        body="Raven leaves the call and finishes uploading what it has. Everything recorded so far is kept and processed as usual — but it cannot rejoin on its own."
        confirmLabel="Stop recording"
        cancelLabel="Keep recording"
        destructive
        pending={stop.isPending}
        onConfirm={confirmStop}
      />
    </div>
  );
}

function describe(state: BotState): { label: string; live: boolean } {
  switch (state) {
    case "queued":
      return { label: "Waiting to be dispatched", live: false };
    case "dispatched":
      return { label: "Starting up", live: false };
    case "joining_meeting":
      return { label: "Joining the call", live: false };
    case "waiting_admission":
      return { label: "Waiting to be let in", live: false };
    case "admitted":
      return { label: "In the call", live: true };
    case "recording":
      return { label: "Recording", live: true };
    case "alone_detected":
      return { label: "Recording — no one else here yet", live: true };
    case "alone_too_long":
      return { label: "Leaving — nobody joined", live: false };
    case "suspended":
      return { label: "Paused", live: false };
    case "finalizing_upload":
      return { label: "Finishing up", live: false };
    case "stopping":
      return { label: "Leaving the call", live: false };
    case "ended":
      return { label: "Call ended — saving the recording", live: false };
    case "complete":
      return { label: "Wrapping up", live: false };
    default:
      return { label: humanize(state), live: false };
  }
}

function humanize(state: string): string {
  const words = state.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function meetCode(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "") || url;
  } catch {
    return url;
  }
}

function useElapsed(since: string): string {
  const start = React.useMemo(() => new Date(since).getTime(), [since]);
  const [now, setNow] = React.useState(start);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!Number.isFinite(start)) return "";
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
