"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { useJoinMeet, useStopBot } from "@/lib/queries";
import { cn } from "@/lib/cn";
import type { CalendarConnection, UpcomingMeeting } from "@/lib/types";

export function UpNext({ items }: { items: UpcomingMeeting[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-rule-lo border-y border-rule-lo">
      {items.map((m) => (
        <li key={m.id}>
          <Row meeting={m} />
        </li>
      ))}
    </ul>
  );
}

function Row({ meeting }: { meeting: UpcomingMeeting }) {
  const [skipping, setSkipping] = React.useState(false);
  const stop = useStopBot();
  const join = useJoinMeet();

  const live = meeting.status === "running";
  const skipped = meeting.status === "skipped";

  function skip() {
    stop.mutate(meeting.jobId, {
      onSuccess: () => {
        setSkipping(false);
        toast("Raven will sit this one out.", {
          description: meeting.title ?? "Untitled meeting",
        });
      },
      onError: (error) => {
        setSkipping(false);
        toast.error("Couldn't skip that meeting.", {
          description: error instanceof Error ? error.message : String(error),
        });
      },
    });
  }

  // Cancel the pending scheduled job first, or it fires at the original start
  // time and a second bot walks into a call Raven is already in.
  async function joinNow() {
    try {
      if (meeting.status === "scheduled") {
        await stop.mutateAsync(meeting.jobId).catch(() => undefined);
      }
      await join.mutateAsync({ url: meeting.meetUrl });
      toast.success("Raven is on its way in.", {
        description: meeting.title ?? "Untitled meeting",
      });
    } catch (error) {
      toast.error("Couldn't send Raven in.", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <div className={cn("group flex items-baseline gap-4 py-3.5", skipped && "opacity-55")}>
      <span className="w-[3.5rem] shrink-0 font-mono text-[12.5px] tabular-nums text-ink-2">
        {startLabel(meeting.startsAt)}
      </span>

      <span className="min-w-0 flex-1">
        <a
          href={meeting.meetUrl}
          target="_blank"
          rel="noreferrer"
          className="group/link inline-flex max-w-full items-center gap-1.5"
        >
          <span
            className={cn(
              "truncate text-[15px] transition-colors duration-150 group-hover/link:text-accent",
              skipped ? "text-ink-2" : "text-ink-1",
            )}
          >
            {meeting.title ?? "Untitled meeting"}
          </span>
          <ArrowUpRight
            size={12}
            className="shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover/link:opacity-100"
          />
        </a>
        <span className="mt-0.5 block text-[12.5px] text-ink-3">
          {dayLabel(meeting.startsAt)}
          {meeting.endsAt
            ? ` · ${lengthLabel(meeting.startsAt, meeting.endsAt)}`
            : ""}
        </span>
      </span>

      {/* Status is exception-only (§7). A call Raven is simply going to join
          says nothing; one in progress, or one deliberately passed over,
          is the exception and speaks. */}
      {live ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-live">
          <span className="size-1.5 animate-pulse rounded-full bg-live" />
          In the call
        </span>
      ) : skipped ? (
        <span className="shrink-0 text-[12.5px] text-ink-3">Not joining</span>
      ) : null}

      <span
        className={cn(
          "shrink-0 transition-opacity duration-150",
          "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        )}
      >
        <Menu label={`Options for ${meeting.title ?? "this meeting"}`}>
          {!live && (
            <MenuItem onClick={joinNow}>Join now</MenuItem>
          )}
          {!skipped && (
            <MenuItem onClick={() => setSkipping(true)}>
              {live ? "Stop recording" : "Skip this one"}
            </MenuItem>
          )}
        </Menu>
      </span>

      <Confirm
        open={skipping}
        onOpenChange={setSkipping}
        title={live ? "Stop recording?" : "Skip this meeting?"}
        body={
          live
            ? "Raven leaves the call and keeps what it has recorded so far."
            : "Raven won't join this one. The event stays in your calendar, you can still send it in manually, and later meetings are unaffected."
        }
        confirmLabel={live ? "Stop recording" : "Skip it"}
        cancelLabel="Never mind"
        destructive
        pending={stop.isPending}
        onConfirm={skip}
      />
    </div>
  );
}

export function UpNextEmpty({
  calendar,
}: {
  calendar: CalendarConnection | null | undefined;
}) {
  const { body, action } = emptyCopy(calendar);

  return (
    <p className="border-y border-rule-lo py-4 text-[13.5px] text-ink-3">
      {body}
      {action && (
        <>
          {" "}
          <Link
            href="/settings/integrations"
            className="text-accent underline decoration-accent-line underline-offset-[0.16em] hover:no-underline"
          >
            {action}
          </Link>
        </>
      )}
    </p>
  );
}

function emptyCopy(calendar: CalendarConnection | null | undefined): {
  body: string;
  action?: string;
} {
  if (!calendar) {
    return {
      body: "Connect a calendar and Raven will join scheduled calls on its own.",
      action: "Connect a calendar",
    };
  }
  if (calendar.status === "disconnected") {
    return {
      body: "Google stopped accepting the saved authorization, so nothing is being scheduled.",
      action: "Reconnect",
    };
  }
  if (calendar.mode === "manual") {
    return {
      body: "Auto-join is off, so Raven only joins the calls you send it to.",
      action: "Turn on auto-join",
    };
  }
  return { body: "Nothing with a Meet link in the next 48 hours." };
}

function startLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const days = Math.round(
    (startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function lengthLabel(startIso: string, endIso: string): string {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000,
  );
  if (!Number.isFinite(mins) || mins <= 0) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}
