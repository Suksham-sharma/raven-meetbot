"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { AppShell } from "@/components/layout/app-shell";
import { AllowanceLine } from "@/components/raven/allowance";
import { AskPanel, AskPanelMuted } from "@/components/raven/ask-panel";
import { FirstRun } from "@/components/raven/first-run";
import { FollowUps } from "@/components/raven/follow-ups";
import { JoinMeetingDialog } from "@/components/raven/join-meeting";
import { LiveSessions } from "@/components/raven/live-session";
import { MeetingCard } from "@/components/raven/meeting-card";
import { EmptyState, SkeletonCard } from "@/components/raven/states";
import { UpNext, UpNextEmpty } from "@/components/raven/up-next";
import { Button } from "@/components/ui/button";
import {
  useActionItems,
  useCalendar,
  useMeetings,
  useRetryMeeting,
  useSession,
  useToggleActionItem,
  useUpcoming,
  useActiveBots,
} from "@/lib/queries";
import { cn } from "@/lib/cn";
import { corpusLabel, toRow } from "@/lib/meetings";
import type { OpenAction, User } from "@/lib/types";

const RECENT = 3;
const CARD_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";
const EYEBROW =
  "text-[11.5px] font-semibold uppercase tracking-[0.11em] text-ink-3";

function firstNameOf(user: User | undefined): string {
  const from = user?.name?.trim() || user?.email?.split("@")[0] || "";
  const first = from.split(/[\s._-]+/)[0] ?? "";
  return first ? first[0].toUpperCase() + first.slice(1) : "";
}

export default function HomePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const actions = useActionItems();
  const toggle = useToggleActionItem();
  const retry = useRetryMeeting();
  const upcoming = useUpcoming();
  const calendar = useCalendar();
  const { active: liveBots } = useActiveBots();
  const [joinOpen, setJoinOpen] = React.useState(false);
  const firstName = firstNameOf(session?.user);
  const { data, error, isPending, refetch } = useMeetings();

  const meetings = data?.meetings ?? [];
  const firstRun = Boolean(data) && meetings.length === 0;
  const recent = meetings.slice(0, RECENT);
  const next = upcoming.data?.upcoming ?? [];
  const followUps = actions.data?.items ?? [];

  function open(id: string, at?: number) {
    const t = at ? `?t=${Math.floor(at)}` : "";
    router.push(`/m/${encodeURIComponent(id)}${t}`);
  }

  return (
    <AppShell
      rail={
        data?.corpus.total ? (
          <div className="flex flex-col gap-7 px-7 py-11">
            <AskPanel corpus={corpusLabel(data.corpus)} />
            {followUps.length > 0 && (
              <div className="border-t border-rule pt-6">
                <FollowUps
                  items={followUps}
                  me={session?.user.name}
                  onOpen={(a: OpenAction) => open(a.meeting_id, a.start_s)}
                  onToggle={(a, completed) =>
                    toggle.mutate({ id: a.id, completed })
                  }
                />
              </div>
            )}
          </div>
        ) : firstRun ? (
          <div className="px-7 py-11">
            <AskPanelMuted />
          </div>
        ) : null
      }
    >
      {firstRun ? (
        <FirstRun
          name={firstName}
          calendar={calendar.data?.calendar}
          onJoin={() => setJoinOpen(true)}
          live={
            liveBots.length > 0 ? (
              <section className="mb-9">
                <h2 className={cn(EYEBROW, "mb-3")}>Live</h2>
                <LiveSessions bots={liveBots} />
              </section>
            ) : null
          }
        />
      ) : (
      <div className="px-12 py-11">
        <header className="mb-9">
          <h1 className="font-serif text-[34px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            Here&rsquo;s a recap of some of your last meetings.
          </p>
          <div className="mt-5">
            <Button variant="primary" size="sm" onClick={() => setJoinOpen(true)}>
              Join a meeting
            </Button>
          </div>
          <AllowanceLine className="mt-3" />
        </header>

        {/* Exception-only, per DESIGN.md §7: nothing renders unless a bot is
            actually in flight. */}
        {liveBots.length > 0 && (
          <section className="rise mb-11 max-w-[46rem]">
            <h2 className={cn(EYEBROW, "mb-3")}>Live</h2>
            <LiveSessions bots={liveBots} />
          </section>
        )}

        {isPending && (
          <div aria-busy="true" aria-label="Loading your meetings">
            <div className={CARD_GRID}>
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <EmptyState
            title="Couldn't load your meetings"
            body={error.message}
            action={{ label: "Try again", onClick: () => refetch() }}
          />
        )}

        {recent.length > 0 && (
          <section className="rise">
            <div className="mb-3.5 flex items-baseline justify-between gap-4">
              <h2 className={EYEBROW}>Recent</h2>
              <Link
                href="/meetings"
                className="group inline-flex items-center gap-1.5 text-[13px] text-ink-2 transition-colors duration-150 hover:text-accent"
              >
                All meetings
                <ArrowRight
                  size={13}
                  className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                />
              </Link>
            </div>
            <div className={CARD_GRID}>
              {recent.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={toRow(m)}
                  onClick={() => open(m.id)}
                  onRetry={() => retry.mutate(m.id)}
                />
              ))}
            </div>
          </section>
        )}

        {data && meetings.length > 0 && (
          <section className="rise mt-11 max-w-[46rem]">
            <h2 className={cn(EYEBROW, "mb-3")}>Next up</h2>
            {next.length > 0 ? (
              <UpNext items={next} />
            ) : (
              <UpNextEmpty calendar={calendar.data?.calendar} />
            )}
          </section>
        )}
      </div>
      )}
      <JoinMeetingDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </AppShell>
  );
}
