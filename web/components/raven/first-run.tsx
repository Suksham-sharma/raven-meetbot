"use client";

import Link from "next/link";
import { useAllowance } from "@/components/raven/allowance";
import { Button } from "@/components/ui/button";
import type { CalendarConnection } from "@/lib/types";

export function FirstRun({
  name,
  calendar,
  onJoin,
  live,
}: {
  name?: string;
  calendar: CalendarConnection | null | undefined;
  onJoin: () => void;
  live?: React.ReactNode;
}) {
  const allowance = useAllowance();

  return (
    <div className="rise px-12 py-11">
      <div className="max-w-[640px]">
        {live}

        <h1 className="font-serif text-[34px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
          Welcome{name ? `, ${name}` : ""}.
        </h1>
        <p className="mt-4 font-serif text-[18.5px] leading-[1.62] font-light">
          Raven sits in your calls and keeps what was said: the decisions, who
          owes what, and the moment anyone said it.
        </p>

        <CalendarBanner calendar={calendar} />

        <div className="mt-8 flex items-center justify-between gap-6 border-y border-rule-lo py-5">
          <div>
            <p className="text-[16.5px] font-medium">
              Or join a call that&rsquo;s happening now
            </p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-2">
              Paste a Meet link. Raven knocks, gets let in, and starts listening.
            </p>
          </div>
          <Button variant="secondary" size="md" className="shrink-0" onClick={onJoin}>
            Join a meeting
          </Button>
        </div>

        <p className="mt-7 text-[13px] leading-relaxed text-ink-3">
          {allowance && `Your first ${allowance.limit} meetings are free. `}
          Raven joins as a visible participant; everyone in the call can see it.
        </p>
      </div>
    </div>
  );
}

function CalendarBanner({
  calendar,
}: {
  calendar: CalendarConnection | null | undefined;
}) {
  const connected = calendar?.status === "connected";
  const watching = connected && calendar.mode === "all";

  const headline = watching
    ? "Raven is watching your calendar"
    : connected
      ? "Let Raven join every meeting"
      : "Let Raven join on its own";
  const body = watching
    ? "It joins the next call with a Meet link a minute early. There is nothing else to set up."
    : connected
      ? "Your calendar is connected. Switch Raven to every meeting and it joins each call with a Meet link a minute early."
      : "Connect Google Calendar and it joins every call with a Meet link, a minute early, without you remembering.";

  return (
    <div className="mt-9 rounded-[18px] bg-accent-tint px-8 py-7">
      <h2 className="font-serif text-[26px] leading-tight font-normal tracking-[-0.014em] text-balance">
        {headline}
      </h2>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
        {body}
      </p>
      {!watching && (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          {connected ? (
            <Link
              href="/settings/integrations"
              className="inline-flex h-11 items-center rounded-[999px] bg-accent px-6 text-[15px] font-medium text-accent-ink transition-[background-color] duration-150 ease-out hover:bg-accent-hi"
            >
              Open calendar settings
            </Link>
          ) : (
            <Button
              variant="primary"
              size="lg"
              onClick={() => window.location.assign("/api/v1/calendar/connect")}
            >
              Connect Google Calendar
            </Button>
          )}
          {!connected && (
            <p className="text-[13px] text-ink-3">
              Reads when your meetings are. Never writes to your calendar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
