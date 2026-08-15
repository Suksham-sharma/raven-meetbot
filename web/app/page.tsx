"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AskPanel } from "@/components/raven/ask-panel";
import { FollowUps } from "@/components/raven/follow-ups";
import { MeetingCard } from "@/components/raven/meeting-card";
import { DayHeading, MeetingRow } from "@/components/raven/meeting-row";
import { EmptyState, SkeletonCard, SkeletonRow } from "@/components/raven/states";
import { Button } from "@/components/ui/button";
import {
  useActionItems,
  useMeetings,
  usePlainSearch,
  useRetryMeeting,
  useSession,
  useToggleActionItem,
} from "@/lib/queries";
import { corpusLabel, groupByDay, toRow } from "@/lib/meetings";
import type { MeetingSummary, OpenAction } from "@/lib/types";

/**
 * Cards for the newest few, rows for the rest.
 *
 * The split earns its keep only if the card shows something the row can't —
 * otherwise it is the same fields at four times the height (§7). So the card
 * carries a line of summary and the row does not: recent meetings get a preview
 * of what happened, the archive stays a dense index you scan to find one.
 *
 * That summary is a deliberate departure from the 2026-08-03 "no summary on the
 * card" entry. It is what makes the two components mean different things instead
 * of being two sizes of one, and it matches §7's own prose ("shows a line of
 * summary"). The plate is still grey until `has_recording` turns true; the
 * summary is what gives the card substance in the meantime.
 */
const RECENT = 3;

export default function MeetingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const actions = useActionItems();
  const toggle = useToggleActionItem();
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("");
  const [participant, setParticipant] = React.useState("");
  const [plainQ, setPlainQ] = React.useState("");
  const [speaker, setSpeaker] = React.useState("");
  const plain = usePlainSearch(plainQ, { speaker: speaker || undefined, enabled: Boolean(plainQ) });
  const {
    data,
    error,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useMeetings({ q, type, participant });

  const meetings = data?.meetings ?? [];

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
            {actions.data && actions.data.items.length > 0 && (
              <div className="border-t border-rule pt-6">
                <FollowUps
                  items={actions.data.items}
                  me={session?.user.name}
                  onOpen={(a: OpenAction) => open(a.meeting_id, a.start_s)}
                  onToggle={(a, completed) =>
                    toggle.mutate({ id: a.id, completed })
                  }
                />
              </div>
            )}
          </div>
        ) : null
      }
    >
      <div className="px-12 py-11">
        <header className="mb-9">
          <h1 className="font-serif text-[34px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
            Everything you&rsquo;ve been in
          </h1>
          {data && (
            <p className="mt-1.5 text-[13px] text-ink-3">
              {corpusLabel(data.corpus)}
            </p>
          )}
        </header>
        <div className="mb-6 flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meetings…" className="h-8 w-48 rounded-md border border-rule bg-paper px-2 text-sm" />
          <input value={type} onChange={(e) => setType(e.target.value)} placeholder="Type" className="h-8 w-28 rounded-md border border-rule bg-paper px-2 text-sm" />
          <input value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder="Participant" className="h-8 w-32 rounded-md border border-rule bg-paper px-2 text-sm" />
        </div>
        <div className="mb-6 rounded-md border border-rule bg-sunk p-3">
          <div className="flex flex-wrap gap-2">
            <input value={plainQ} onChange={(e) => setPlainQ(e.target.value)} placeholder="Plain search (no LLM) — find where we said X" className="h-8 flex-1 min-w-48 rounded-md border border-rule bg-paper px-2 text-sm" />
            <input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Speaker (e.g. Ankur)" className="h-8 w-32 rounded-md border border-rule bg-paper px-2 text-sm" />
          </div>
          {plain.data && plain.data.hits.length > 0 && (
            <div className="mt-3 divide-y divide-rule">
              {plain.data.hits.slice(0, 8).map((h) => (
                <button key={h.chunk_id} onClick={() => open(h.meeting_id, h.start_s)} className="block w-full py-2 text-left">
                  <span className="text-xs text-ink-3">{h.speaker ?? "?"} · {h.meeting_id} · {Math.floor(h.start_s)}s</span>
                  <span className="line-clamp-2 text-sm">{h.text}</span>
                </button>
              ))}
            </div>
          )}
          {plain.data && plain.data.hits.length === 0 && <p className="mt-2 text-xs text-ink-3">No matches</p>}
        </div>

        {isPending && <Loading />}

        {error && (
          <EmptyState
            title="Couldn't load your meetings"
            body={error.message}
            action={{ label: "Try again", onClick: () => refetch() }}
          />
        )}

        {data && meetings.length === 0 && (
          <EmptyState
            title="No meetings yet"
            body="Invite Raven to a Google Meet call and it will join, record, and remember it."
            boundary="Raven joins as a visible participant. Everyone in the call can see it."
          />
        )}

        {meetings.length > 0 && (
          <Archive
            meetings={meetings}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            onOpen={open}
          />
        )}
      </div>

    </AppShell>
  );
}

function Archive({
  meetings,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onOpen,
}: {
  meetings: MeetingSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
}) {
  const retry = useRetryMeeting();
  const recent = meetings.slice(0, RECENT);
  const rest = meetings.slice(RECENT);

  return (
    // `.rise` is already scoped to prefers-reduced-motion in globals.css, and it
    // runs on the block rather than per row — §6 gives list rows colour change
    // only, so a staggered cascade would argue with the rule on every visit.
    <div className="rise">
      <div className={CARD_GRID}>
        {recent.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={toRow(m)}
            onClick={() => onOpen(m.id)}
            onRetry={() => retry.mutate(m.id)}
          />
        ))}
      </div>

      {rest.length > 0 && (
        <div className="mt-10 border-t border-rule-lo pt-2">
          {groupByDay(rest).map((group) => (
            <section key={group.key} className="mb-8 last:mb-0">
              <DayHeading>{group.label}</DayHeading>
              <div className="divide-y divide-rule-lo">
                {group.meetings.map((m) => (
                  <MeetingRow
                    key={m.id}
                    meeting={toRow(m)}
                    onClick={() => onOpen(m.id)}
                    onRetry={() => retry.mutate(m.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {hasNextPage && (
        <div className="mt-10 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={isFetchingNextPage}
            onClick={onLoadMore}
          >
            Load older meetings
          </Button>
        </div>
      )}
    </div>
  );
}

// Tracks, not a fixed column count: the column width shifts with the nav and
// rail state, so a breakpoint guesses wrong at half the widths. Floor 232px is
// where the meta line stops truncating to "Marco …"; cap 300px keeps the plate
// from ballooning into a big grey box on a wide column (aspect-video means
// width sets height). Extra width becomes a right-hand gap, not taller cards.
const CARD_GRID = "grid grid-cols-[repeat(auto-fill,minmax(232px,300px))] gap-4";

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading your meetings">
      <div className={CARD_GRID}>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="mt-10 border-t border-rule-lo pt-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}
