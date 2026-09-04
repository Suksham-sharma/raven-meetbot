"use client";

import { CalendarBlank, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { useAllowance } from "@/components/raven/allowance";
import { EmptyState } from "@/components/raven/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  useCalendar,
  useDisconnectCalendar,
  useSyncCalendar,
  useUpdateCalendar,
} from "@/lib/queries";
import type { CalendarConnection, CalendarMode } from "@/lib/types";

export function IntegrationsScreen({
  calendarResult,
}: {
  calendarResult?: string;
}) {
  const calendar = useCalendar();
  const updateCalendar = useUpdateCalendar();
  const disconnectCalendar = useDisconnectCalendar();
  const syncCalendar = useSyncCalendar();

  function connect() {
    window.location.assign("/api/v1/calendar/connect");
  }

  return (
    <AppShell>
      <div className="px-6 py-9 sm:px-12 sm:py-11">
        <header className="measure mb-10">
          <p className="mb-2 text-[12px] font-medium tracking-[0.12em] text-ink-3 uppercase">
            Settings
          </p>
          <h1 className="font-serif text-[34px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
            Integrations
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
            What Raven is connected to.
          </p>
        </header>

        <section className="measure" aria-labelledby="calendar-heading">
          <div className="mb-4 flex items-center gap-2.5">
            <CalendarBlank size={19} className="text-ink-3" aria-hidden="true" />
            <h2 id="calendar-heading" className="text-[15px] font-medium">
              Google Calendar
            </h2>
          </div>

          <div className="rounded-xl border border-rule-lo bg-white px-6 py-2 shadow-e1 sm:px-8">
            {calendar.isPending && <CalendarSkeleton />}

            {calendar.error && (
              <EmptyState
                title="Couldn't load your calendar settings"
                body={calendar.error.message}
                action={{ label: "Try again", onClick: () => calendar.refetch() }}
              />
            )}

            {calendar.data?.calendar === null && calendarResult !== "denied" && (
              <EmptyState
                title="Raven doesn't know your schedule yet"
                body="Connect Google Calendar and Raven can join the meetings you choose automatically."
                action={{ label: "Connect Google Calendar", onClick: connect }}
                boundary="Raven reads when your meetings are and where they meet. It never writes to your calendar."
              />
            )}

            {calendar.data?.calendar === null && calendarResult === "denied" && (
              <ConnectionProblem
                title="Google Calendar wasn't connected"
                body="Google didn't grant calendar access. Try connecting again when you're ready."
                onReconnect={connect}
              />
            )}

            {calendar.data?.calendar?.status === "disconnected" && (
              <ConnectionProblem
                title={calendarResult === "denied" ? "Google Calendar wasn't connected" : "Raven has stopped joining your meetings"}
                body={calendarResult === "denied" ? "Google didn't grant calendar access. Try connecting again when you're ready." : "Google ended the connection. Reconnect your calendar to resume automatic joins."}
                onReconnect={connect}
              />
            )}

            {calendar.data?.calendar?.status === "connected" && (
              <ConnectedCalendar
                calendar={calendar.data.calendar}
                modePending={updateCalendar.isPending}
                modeError={updateCalendar.error?.message}
                disconnectPending={disconnectCalendar.isPending}
                disconnectError={disconnectCalendar.error?.message}
                syncPending={syncCalendar.isPending}
                syncError={syncCalendar.error?.message}
                onModeChange={(mode) => updateCalendar.mutate(mode)}
                onDisconnect={() => disconnectCalendar.mutate()}
                onSync={() => syncCalendar.mutate()}
              />
            )}
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            Raven reads upcoming event details to find Google Meet calls. It never writes to your
            calendar. See the{" "}
            <Link href="/privacy" className="font-medium text-ink-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function ConnectedCalendar({
  calendar,
  modePending,
  modeError,
  disconnectPending,
  disconnectError,
  syncPending,
  syncError,
  onModeChange,
  onDisconnect,
  onSync,
}: {
  calendar: CalendarConnection;
  modePending: boolean;
  modeError?: string;
  disconnectPending: boolean;
  disconnectError?: string;
  syncPending: boolean;
  syncError?: string;
  onModeChange: (mode: CalendarMode) => void;
  onDisconnect: () => void;
  onSync: () => void;
}) {
  const error = modeError ?? disconnectError ?? syncError;
  const allowance = useAllowance();
  const paused = calendar.mode === "all" && Boolean(allowance?.exhausted);

  return (
    <div className="py-6 sm:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-medium">{calendar.email}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            Google Calendar · connected {formatDate(calendar.connectedAt)}
            {calendar.lastCheckedAt && ` · checked ${formatRelativeTime(calendar.lastCheckedAt)}`}
          </p>
        </div>
        <Button
          variant="quiet"
          size="sm"
          loading={disconnectPending}
          onClick={onDisconnect}
          className="self-start"
        >
          Disconnect
        </Button>
      </div>

      {calendar.lastError && (
        <div className="mt-5 flex flex-col gap-3 rounded-lg bg-warn-tint px-4 py-3 sm:flex-row sm:items-center">
          <WarningCircle size={18} className="shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-warn">Raven couldn&rsquo;t check your calendar</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">It will keep trying. You can check again now.</p>
          </div>
          <Button variant="secondary" size="sm" loading={syncPending} onClick={onSync}>
            Try again
          </Button>
        </div>
      )}

      {paused && allowance && (
        <p className="mt-5 rounded-lg bg-card px-4 py-3 text-[13px] leading-relaxed text-ink-2">
          You&rsquo;ve used your {allowance.limit} free meetings, so Raven
          won&rsquo;t join new ones from your calendar.
        </p>
      )}

      <div className="my-6 border-t border-rule-lo" />

      <fieldset disabled={modePending || disconnectPending}>
        <legend className="text-[14px] font-medium">When Raven joins</legend>
        <p className="mt-1 text-[13px] text-ink-3">Choose how meetings get added to Raven.</p>
        <div className="mt-4 grid gap-2.5">
          <ModeChoice
            mode="all"
            selected={calendar.mode === "all"}
            title="Every meeting on my calendar"
            body="Anything with a Google Meet link, from a minute before it starts."
            onChange={onModeChange}
          />
          <ModeChoice
            mode="manual"
            selected={calendar.mode === "manual"}
            title="Only when I ask"
            body="Raven joins when you paste a meeting link."
            onChange={onModeChange}
          />
        </div>
      </fieldset>

      {error && <p role="alert" className="mt-4 text-[13px] text-live">{error}</p>}
    </div>
  );
}

function ModeChoice({
  mode,
  selected,
  title,
  body,
  onChange,
}: {
  mode: CalendarMode;
  selected: boolean;
  title: string;
  body: string;
  onChange: (mode: CalendarMode) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border px-4 py-3.5 transition-colors duration-150",
        selected
          ? "border-accent-line bg-accent-tint"
          : "border-rule-lo hover:border-rule hover:bg-paper",
      )}
    >
      <input
        type="radio"
        name="calendar-mode"
        value={mode}
        checked={selected}
        onChange={() => onChange(mode)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "mt-0.5 grid size-[17px] shrink-0 place-items-center rounded-full border bg-white",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
          selected ? "border-accent" : "border-field",
        )}
        aria-hidden="true"
      >
        {selected && <span className="size-[7px] rounded-full bg-accent" />}
      </span>
      <span>
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{body}</span>
      </span>
    </label>
  );
}

function ConnectionProblem({
  title,
  body,
  onReconnect,
}: {
  title: string;
  body: string;
  onReconnect: () => void;
}) {
  return (
    <div className="py-9">
      <div className="flex gap-3">
        <WarningCircle size={20} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div>
          <p className="font-serif text-[21px] leading-tight tracking-[-0.012em]">{title}</p>
          <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{body}</p>
          <Button variant="secondary" size="sm" onClick={onReconnect} className="mt-4">
            Reconnect Google Calendar
          </Button>
        </div>
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="animate-pulse py-8" aria-label="Loading calendar settings">
      <div className="h-4 w-52 rounded-xs bg-sunk" />
      <div className="mt-2 h-3 w-72 max-w-full rounded-xs bg-sunk" />
      <div className="mt-7 h-20 rounded-md bg-card" />
      <div className="mt-2.5 h-20 rounded-md bg-card" />
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatRelativeTime(value: string): string {
  const elapsed = new Date(value).getTime() - Date.now();
  const minutes = Math.round(elapsed / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");

  return formatter.format(Math.round(hours / 24), "day");
}
