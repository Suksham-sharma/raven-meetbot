"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "@phosphor-icons/react";
import { AppShell } from "@/components/layout/app-shell";
import { AskPanel } from "@/components/raven/ask-panel";
import { CitationChip } from "@/components/raven/evidence";
import { Player } from "@/components/raven/player";
import { Participants } from "@/components/raven/speaker";
import { EmptyState, Processing, SkeletonCard } from "@/components/raven/states";
import { TaskRow } from "@/components/raven/task-row";
import { TranscriptView } from "@/components/raven/transcript";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { corpusLabel } from "@/lib/meetings";
import { usePlayer } from "@/lib/player";
import { useTheater } from "@/lib/use-theater";
import {
  keys,
  useMeeting,
  useMeetings,
  useRecording,
  useSession,
  useTranscript,
} from "@/lib/queries";
import { duration, longDate, timecode } from "@/lib/speaker";
import type { Decision, MeetingActionItem, MeetingDetail } from "@/lib/types";

/**
 * The moment is the atomic unit of this product (DESIGN.md §1), so every
 * surface on this page resolves to one: a decision opens the quote behind it, a
 * chapter is a seek, a transcript turn is a seek, and `?t=` is how a citation
 * from anywhere else in the app lands here.
 *
 * The player is pinned in the rail rather than run as a hero because a hero
 * scrolls away exactly when quote-clicking starts (§5).
 */
export default function Page() {
  // useSearchParams needs a boundary; the deep link is read below it.
  return (
    <React.Suspense fallback={<div className="h-dvh bg-paper" />}>
      <MeetingView />
    </React.Suspense>
  );
}

type Tab = "happened" | "said";

function MeetingView() {
  const { id } = useParams<{ id: string }>();
  const meetingId = decodeURIComponent(id);
  const params = useSearchParams();

  const [tab, setTab] = React.useState<Tab>("happened");
  const [theater, toggleTheater] = useTheater();
  const { data: session } = useSession();
  const meeting = useMeeting(meetingId);
  const recording = useRecording(meetingId);
  const transcript = useTranscript(meetingId);
  const archive = useMeetings();

  const requestSeek = usePlayer((s) => s.requestSeek);
  const reset = usePlayer((s) => s.reset);

  // Position is per-meeting; carrying it across would highlight a turn in a
  // transcript that no longer exists.
  React.useEffect(() => reset, [meetingId, reset]);

  // Land on the cited second once the media is actually there to seek. Without
  // autoplay: arriving at a moment should not start sound the reader did not ask
  // for, and browsers block it anyway.
  //
  // Keyed on the value rather than latched once, because a citation can point at
  // the meeting already open — that is a same-route push with a new `?t=`, and a
  // one-shot guard would swallow every jump after the first.
  const landedAt = React.useRef<string | null>(null);
  React.useEffect(() => {
    const raw = params.get("t");
    if (!raw || !recording.data || landedAt.current === raw) return;
    const t = Number(raw);
    if (!Number.isFinite(t) || t < 0) return;
    landedAt.current = raw;
    requestSeek(t + recording.data.recording_offset_s, false);
  }, [params, recording.data, requestSeek]);

  const notFound =
    meeting.error instanceof ApiError && meeting.error.status === 404;

  if (notFound) {
    return (
      <AppShell>
        <div className="px-12 py-11">
          <EmptyState
            title="That meeting isn't here"
            body="It may have been deleted, or it belongs to someone else."
          />
        </div>
      </AppShell>
    );
  }

  const m = meeting.data;

  return (
    <AppShell
      rail={
        <div className="flex flex-col gap-7 px-7 py-8">
          {!theater && (
            <RecordingPane
              state={recording}
              meeting={m}
              turns={transcript.data?.turns}
              onToggleTheater={toggleTheater}
            />
          )}
          {m && m.chapters.length > 0 && (
            <Chapters
              meeting={m}
              offsetS={recording.data?.recording_offset_s ?? 0}
            />
          )}
          {m && (
            <div className="border-t border-rule pt-6">
              {/* Scoped to this meeting — asking "what did we decide?" while
                  looking at one call and getting four others' decisions reads
                  as the product ignoring the page you are on. */}
              <AskPanel
                corpus={
                  archive.data ? corpusLabel(archive.data.corpus) : ""
                }
                scope={{ meetingId: m.id, title: title(m) }}
              />
            </div>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col px-12 py-11">
        {meeting.isPending && <SkeletonCard />}

        {m && (
          <>
            {/* Theater: the video takes the column, and the title and detail
                sit under it. It docks to a corner once scrolled past — the
                objection to a video hero was that it scrolls away exactly when
                quote-clicking starts, and this answers that rather than
                accepting it. */}
            {theater && (
              <TheaterSlot>
                <RecordingPane
                  state={recording}
                  meeting={m}
                  turns={transcript.data?.turns}
                  theater
                  onToggleTheater={toggleTheater}
                />
              </TheaterSlot>
            )}

            <header>
              <h1 className="font-serif text-[34px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
                {title(m)}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
                <span>{longDate(m.started_at ?? "")}</span>
                {m.duration_s ? <span>· {duration(m.duration_s)}</span> : null}
                {m.participants.length > 0 && (
                  <span>
                    · <Participants names={m.participants} max={4} />
                  </span>
                )}
              </p>
            </header>

            <nav className="mt-7 mb-6 flex gap-1.5" aria-label="Meeting views">
              <TabChip
                active={tab === "happened"}
                onClick={() => setTab("happened")}
              >
                What happened
              </TabChip>
              <TabChip
                active={tab === "said"}
                onClick={() => setTab("said")}
                count={transcript.data?.turns.length}
              >
                Everything said
              </TabChip>
            </nav>

            {tab === "happened" ? (
              <Happened meeting={m} me={session?.user.name} />
            ) : (
              <SaidTab
                pending={transcript.isPending}
                error={transcript.error}
                turns={transcript.data?.turns}
                offsetS={transcript.data?.recording_offset_s ?? 0}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function title(m: MeetingDetail): string {
  return m.title ?? m.chapters[0]?.title ?? m.id;
}

/**
 * The theater player sits above the document rather than scrolling with it: the
 * column pins the video, title, detail and tabs, and only the section beneath
 * scrolls. So the objection to a video hero — that it scrolls away exactly when
 * quote-clicking starts — does not apply here. It never leaves.
 *
 * Height is capped instead. 16:9 across a wide column is tall enough to leave a
 * short viewport with a video and nothing to read, and since the document
 * scrolls *under* the player there would be no way to scroll the rest of it
 * into view. Capping the width by the height the aspect ratio implies keeps the
 * frame intact and always leaves the document room.
 */
function TheaterSlot({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-7 w-full max-w-[calc(46vh*16/9)] shrink-0">{children}</div>
  );
}

function TabChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[999px] px-4 text-[13.5px]",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-accent font-medium text-accent-ink"
          : "bg-card text-ink-3 hover:text-ink-2",
      )}
    >
      {children}
      {count != null && (
        <span className="font-mono text-[11px] tabular-nums opacity-60">
          {count}
        </span>
      )}
    </button>
  );
}

function Happened({
  meeting,
  me,
}: {
  meeting: MeetingDetail;
  me?: string | null;
}) {
  const nothing =
    !meeting.summary &&
    meeting.decisions.length === 0 &&
    meeting.action_items.length === 0;

  if (nothing) {
    return (
      <Processing
        label="Still reading through this one"
        hint="Summary and decisions appear when it finishes"
      />
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto pb-8">
      {meeting.summary && (
        <section className="mb-10">
          <SectionHead>What happened</SectionHead>
          {/* Summary prose is speech reported back, so it is serif (§4). */}
          <p className="measure font-serif text-[18.5px] leading-[1.62] font-light">
            {meeting.summary}
          </p>
        </section>
      )}

      {meeting.decisions.length > 0 && (
        <section className="mb-10">
          <SectionHead>Decided</SectionHead>
          <ul className="flex flex-col gap-5">
            {meeting.decisions.map((d) => (
              <li key={d.id}>
                <Statement item={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {meeting.action_items.length > 0 && (
        <section className="mb-10">
          <SectionHead>Someone needs to</SectionHead>
          <Tasks meeting={meeting} me={me} />
        </section>
      )}
    </div>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3.5 text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
      {children}
    </h2>
  );
}

/**
 * Evidence is a footnote, not a card (§7): the chip names a person and a moment,
 * and unfolds the quote beneath rather than boxing it. A box would hand a
 * fallible extraction more standing than it has earned.
 */
function Statement({ item }: { item: Decision }) {
  const [open, setOpen] = React.useState(false);
  const requestSeek = usePlayer((s) => s.requestSeek);

  return (
    <div>
      <p className="measure text-[16.5px] leading-[1.5] font-medium">
        {item.text}
      </p>

      <div className="mt-2">
        <CitationChip
          speaker={item.speaker ?? "Unattributed"}
          at={item.start_s}
          open={open}
          onClick={() => setOpen((v) => !v)}
        />
      </div>

      {open && (
        <div className="measure mt-3 border-l-2 border-accent-line pl-4">
          <q className="mb-1.5 block font-serif text-[15.5px] leading-[1.55] font-light text-ink-2 italic [quotes:none]">
            {item.evidence_quote}
          </q>
          <button
            type="button"
            onClick={() => requestSeek(item.start_s)}
            aria-label={`Play ${item.speaker ?? "this moment"} at ${timecode(item.start_s)}`}
            className="-my-1 inline-flex min-h-6 items-center gap-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:text-accent"
          >
            <Play size={11} weight="fill" />
            Play
          </button>
        </div>
      )}
    </div>
  );
}

function Tasks({
  meeting,
  me,
}: {
  meeting: MeetingDetail;
  me?: string | null;
}) {
  const queryClient = useQueryClient();
  const requestSeek = usePlayer((s) => s.requestSeek);

  // Patched in place rather than invalidated, matching the follow-ups rail: the
  // list is ordered by seq here, so nothing moves, but a refetch would still
  // blank the row for a beat on a control people click reflexively.
  const toggle = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) =>
      api.setActionItemCompleted(id, completed),
    onMutate: async ({ id, completed }) => {
      const key = keys.meeting(meeting.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MeetingDetail>(key);
      queryClient.setQueryData<MeetingDetail>(key, (old) =>
        old
          ? {
              ...old,
              action_items: old.action_items.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      completed_at: completed ? new Date().toISOString() : null,
                    }
                  : a,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(keys.meeting(meeting.id), ctx.previous);
      }
    },
    onSettled: () => {
      // The cross-meeting rail counts these, so it has to hear about it.
      void queryClient.invalidateQueries({ queryKey: keys.actionItems });
    },
  });

  return (
    <div>
      {meeting.action_items.map((a: MeetingActionItem) => (
        <TaskRow
          key={a.id}
          item={{
            id: a.id,
            text: a.text,
            owner: a.owner,
            due: a.due,
            at: a.start_s,
            mine: Boolean(me && a.owner && sameName(a.owner, me)),
            done: a.completed_at != null,
          }}
          onToggle={(completed) => toggle.mutate({ id: a.id, completed })}
          onJump={() => requestSeek(a.start_s)}
        />
      ))}
    </div>
  );
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function SaidTab({
  pending,
  error,
  turns,
  offsetS,
}: {
  pending: boolean;
  error: Error | null;
  turns?: { speaker: string; start_s: number; end_s: number; text: string }[];
  offsetS: number;
}) {
  // A missing transcript is the normal state for the first minutes after a call,
  // so it takes the neutral processing tone rather than an error (§7).
  if (error instanceof ApiError && error.status === 409) {
    return <Processing />;
  }
  if (error) {
    return <EmptyState title="Couldn't load the transcript" body={error.message} />;
  }
  if (pending || !turns) {
    return <Processing label="Loading what was said" hint="One moment" />;
  }
  if (turns.length === 0) {
    return (
      <EmptyState
        title="Nothing was transcribed"
        body="The recording exists, but no speech was picked up."
      />
    );
  }
  return <TranscriptView turns={turns} offsetS={offsetS} />;
}

function RecordingPane({
  state,
  meeting,
  turns,
  theater,
  onToggleTheater,
}: {
  state: ReturnType<typeof useRecording>;
  meeting?: MeetingDetail;
  turns?: { speaker: string; start_s: number; end_s: number; text: string }[];
  theater?: boolean;
  onToggleTheater?: () => void;
}) {
  if (state.data && meeting) {
    const player = (
      <Player
        recording={state.data}
        chapters={meeting.chapters}
        turns={turns}
        title={title(meeting)}
        theater={theater}
        onToggleTheater={onToggleTheater}
      />
    );
    // In theater the column wrapper already pins it; in the rail it pins itself,
    // so it stays seekable while the document is read (§5).
    return theater ? (
      player
    ) : (
      <div className="sticky top-0 -mx-1 px-1 pt-1">{player}</div>
    );
  }

  if (state.error instanceof ApiError && state.error.status === 409) {
    return <Processing label="Preparing the recording" hint="Usually a few minutes" />;
  }
  if (state.error) {
    return (
      <p className="text-[13px] text-ink-3">
        The recording isn&rsquo;t available for this meeting.
      </p>
    );
  }
  return <div className="aspect-video w-full animate-pulse rounded-lg bg-sunk" />;
}

function Chapters({
  meeting,
  offsetS,
}: {
  meeting: MeetingDetail;
  offsetS: number;
}) {
  const currentS = usePlayer((s) => s.currentS);
  const requestSeek = usePlayer((s) => s.requestSeek);

  return (
    <nav aria-label="Chapters">
      <SectionHead>Chapters</SectionHead>
      <ul className="-mx-2">
        {meeting.chapters.map((c) => {
          const here =
            currentS >= c.start_s + offsetS && currentS < c.end_s + offsetS;
          return (
            <li key={c.seq}>
              <button
                type="button"
                onClick={() => requestSeek(c.start_s + offsetS)}
                aria-current={here ? "true" : undefined}
                // Spelled out, or the computed name runs the timecode into the
                // title and then reads the gist too — "0:37IntroductionSuksham
                // introduces himself and…". Same trap the meeting row names.
                aria-label={`${c.title}, ${timecode(c.start_s)}, jump to this moment`}
                className={cn(
                  "flex w-full items-baseline gap-3 rounded-md px-2 py-2 text-left",
                  "transition-colors duration-150 ease-out",
                  here ? "bg-accent-tint" : "hover:bg-card",
                )}
              >
                <span className="w-[38px] shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
                  {timecode(c.start_s)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-[14px] leading-snug",
                      here ? "font-medium text-accent" : "text-ink-1",
                    )}
                  >
                    {c.title}
                  </span>
                  {c.gist && (
                    <span className="mt-0.5 block font-serif text-[13.5px] leading-[1.45] font-light text-ink-3">
                      {c.gist}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
