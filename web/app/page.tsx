"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AskPanel } from "@/components/raven/ask-panel";
import { DayHeading, MeetingRow } from "@/components/raven/meeting-row";
import { EmptyState, SkeletonRow } from "@/components/raven/states";
import { Button } from "@/components/ui/button";
import { useMeetings } from "@/lib/queries";
import { corpusLabel, groupByDay, toRow } from "@/lib/meetings";
import type { MeetingSummary } from "@/lib/types";

export default function MeetingsPage() {
  const {
    data,
    error,
    isPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useMeetings();

  const corpus = data ? corpusLabel(data.corpus) : "";

  return (
    <AppShell rail={data?.corpus.total ? <AskPanel corpus={corpus} /> : null}>
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

        {isPending && (
          <div>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {error && (
          <EmptyState
            title="Couldn't load your meetings"
            body={error.message}
            action={{ label: "Try again", onClick: () => refetch() }}
          />
        )}

        {data && data.meetings.length === 0 && (
          <EmptyState
            title="No meetings yet"
            body="Invite Raven to a Google Meet call and it will join, record, and remember it."
            boundary="Raven joins as a visible participant. Everyone in the call can see it."
          />
        )}

        {data && data.meetings.length > 0 && (
          <MeetingList
            meetings={data.meetings}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
          />
        )}
      </div>
    </AppShell>
  );
}

function MeetingList({
  meetings,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  meetings: MeetingSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const router = useRouter();

  return (
    <>
      {groupByDay(meetings).map((group) => (
        <section key={group.key} className="mb-8 last:mb-0">
          <DayHeading>{group.label}</DayHeading>
          <div className="divide-y divide-rule-lo">
            {group.meetings.map((m) => (
              <MeetingRow
                key={m.id}
                meeting={toRow(m)}
                onClick={() => router.push(`/m/${encodeURIComponent(m.id)}`)}
              />
            ))}
          </div>
        </section>
      ))}

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
    </>
  );
}
