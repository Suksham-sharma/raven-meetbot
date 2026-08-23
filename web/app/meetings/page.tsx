"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { AppShell } from "@/components/layout/app-shell";
import { JoinMeetingDialog } from "@/components/raven/join-meeting";
import { UploadRecordingSheet } from "@/components/raven/upload-recording";
import { MeetingCard } from "@/components/raven/meeting-card";
import { DayHeading, MeetingRow } from "@/components/raven/meeting-row";
import { EmptyState, SkeletonCard, SkeletonRow } from "@/components/raven/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useMeetings, useRetryMeeting } from "@/lib/queries";
import { corpusLabel, groupByDay, toRow } from "@/lib/meetings";
import type { MeetingSummary } from "@/lib/types";

const RECENT = 3;
const CARD_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

export default function MeetingsPage() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("");
  const [participant, setParticipant] = React.useState("");
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const filters = {
    q: useDebounced(q),
    type: useDebounced(type),
    participant: useDebounced(participant),
  };
  const filtered = Boolean(filters.q || filters.type || filters.participant);

  const {
    data,
    error,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useMeetings(filters);

  const meetings = data?.meetings ?? [];

  function open(id: string) {
    router.push(`/m/${encodeURIComponent(id)}`);
  }

  function clearFilters() {
    setQ("");
    setType("");
    setParticipant("");
  }

  return (
    <AppShell>
      <div className="px-12 py-11">
        <header className="mb-8">
          <h1 className="font-serif text-[34px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
            Everything you&rsquo;ve been in
          </h1>
          {data && (
            <p className="mt-1.5 text-[13px] text-ink-3">
              {corpusLabel(data.corpus)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => setJoinOpen(true)}>
              Join a meeting
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUploadOpen(true)}
            >
              Upload recording
            </Button>
          </div>
        </header>

        <JoinMeetingDialog open={joinOpen} onOpenChange={setJoinOpen} />
        <UploadRecordingSheet open={uploadOpen} onOpenChange={setUploadOpen} />

        <div className="mb-8 flex flex-wrap items-center gap-2.5">
          <div className="min-w-[240px] flex-1 basis-64 sm:max-w-sm">
            <Field
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search meetings"
              placeholder="Search meetings"
              icon={<MagnifyingGlass size={15} />}
            />
          </div>
          <div className="w-36">
            <Field
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Filter by meeting type"
              placeholder="Type"
            />
          </div>
          <div className="w-44">
            <Field
              value={participant}
              onChange={(e) => setParticipant(e.target.value)}
              aria-label="Filter by participant"
              placeholder="Participant"
            />
          </div>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {isPending && <Loading />}

        {error && (
          <EmptyState
            title="Couldn't load your meetings"
            body={error.message}
            action={{ label: "Try again", onClick: () => refetch() }}
          />
        )}

        {data && meetings.length === 0 && filtered && (
          <EmptyState
            title="Nothing matches those filters"
            body="Try a looser search, or clear the filters to see everything."
            action={{ label: "Clear filters", onClick: clearFilters }}
          />
        )}

        {data && meetings.length === 0 && !filtered && (
          <EmptyState
            title="No meetings yet"
            body="Invite Raven to a Google Meet call and it will join, record, and remember it."
            boundary="Raven joins as a visible participant. Everyone in the call can see it."
          />
        )}

        {meetings.length > 0 && (
          <Archive
            meetings={meetings}
            grouped={!filtered}
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
  grouped,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onOpen,
}: {
  meetings: MeetingSummary[];
  grouped: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onOpen: (id: string) => void;
}) {
  const retry = useRetryMeeting();
  const recent = grouped ? meetings.slice(0, RECENT) : [];
  const rest = grouped ? meetings.slice(RECENT) : meetings;

  return (
    <div className="rise">
      {recent.length > 0 && (
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
      )}

      {rest.length > 0 && (
        <div
          className={
            recent.length > 0 ? "mt-10 border-t border-rule-lo pt-2" : undefined
          }
        >
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
