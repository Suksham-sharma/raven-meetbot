"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Play } from "@phosphor-icons/react";
import { AppShell } from "@/components/layout/app-shell";
import { AskPanel } from "@/components/raven/ask-panel";
import { CitationChip } from "@/components/raven/evidence";
import { Player } from "@/components/raven/player";
import { Participants } from "@/components/raven/speaker";
import { EmptyState, Processing, SkeletonCard } from "@/components/raven/states";
import { Proposals } from "@/components/raven/proposals";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/ui/confirm";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { TaskRow } from "@/components/raven/task-row";
import { TranscriptView } from "@/components/raven/transcript";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { corpusLabel } from "@/lib/meetings";
import { usePlayer } from "@/lib/player";
import { useTheater } from "@/lib/use-theater";
import {
  keys,
  useDeleteMeeting,
  useMeeting,
  useMeetingActions,
  useMeetings,
  useRecording,
  useRetryMeeting,
  useSession,
  useTranscript,
  useUpdateMeeting,
} from "@/lib/queries";
import { duration, longDate, timecode } from "@/lib/speaker";
import type { Decision, MeetingActionItem, MeetingDetail } from "@/lib/types";

export default function Page() {
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
  const [override, setOverride] = React.useState<boolean | null>(null);
  const bigPlayer = override ?? (theater && tab !== "said");

  function chooseTab(next: Tab) {
    setTab(next);
    setOverride(null);
  }

  function togglePlayerMode() {
    if (tab === "said") setOverride(!bigPlayer);
    else {
      setOverride(null);
      toggleTheater();
    }
  }
  const { data: session } = useSession();
  const meeting = useMeeting(meetingId);
  const recording = useRecording(meetingId);
  const transcript = useTranscript(meetingId);
  const archive = useMeetings();

  const requestSeek = usePlayer((s) => s.requestSeek);
  const reset = usePlayer((s) => s.reset);
  const retry = useRetryMeeting();
  const del = useDeleteMeeting();
  const upd = useUpdateMeeting();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState("");

  // Position is per-meeting: carrying it across highlights a turn that is gone.
  React.useEffect(() => reset, [meetingId, reset]);

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
  const noMedia =
    recording.error instanceof ApiError && recording.error.reason === "no_media";

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
          {!bigPlayer && (
            <RecordingPane
              state={recording}
              meeting={m}
              turns={transcript.data?.turns}
              onToggleTheater={togglePlayerMode}
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
      {/* The summary is a document and scrolls the column. The transcript is
          its own scroll region, so the column is pinned to the viewport and the
          list scrolls inside it rather than dragging the page along. */}
      <div
        className={cn(
          "flex flex-col px-12 py-11",
          tab === "said" && "h-full min-h-0",
        )}
      >
        {meeting.isPending && <SkeletonCard />}

        {m && (
          <>
            <header className="mb-9">
              <Link
                href="/meetings"
                className={cn(
                  "group mb-4 inline-flex items-center gap-1.5 text-[13px] text-ink-3",
                  "transition-colors duration-150 hover:text-ink-1",
                )}
              >
                <ArrowLeft
                  size={13}
                  className="transition-transform duration-150 ease-out group-hover:-translate-x-0.5"
                />
                All meetings
              </Link>
              <div className="flex items-start justify-between gap-2">
                {editing ? (
                  <input value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} className="flex-1 rounded-md border border-rule bg-paper px-2 py-1 font-serif text-[24px]" autoFocus />
                ) : (
                  <h1 className="font-serif text-[34px] leading-[1.15] font-normal tracking-[-0.018em] text-balance">
                    {title(m)}
                  </h1>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {editing ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          upd.mutate(
                            { id: m.id, title: titleDraft },
                            {
                              onSuccess: () => toast.success("Renamed."),
                              onError: (e) =>
                                toast.error("Couldn't rename this meeting.", {
                                  description:
                                    e instanceof Error ? e.message : String(e),
                                }),
                            },
                          );
                          setEditing(false);
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Menu bordered>
                      <MenuItem
                        onClick={() => {
                          setTitleDraft(title(m));
                          setEditing(true);
                        }}
                      >
                        Rename
                      </MenuItem>
                      <MenuItem onClick={() => exportMeeting(m.id)}>
                        Export as Markdown
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive onClick={() => setDeleting(true)}>
                        Delete meeting
                      </MenuItem>
                    </Menu>
                  )}
                </div>
              </div>
              <Confirm
                open={deleting}
                onOpenChange={setDeleting}
                title="Delete this meeting?"
                body="The recording, transcript, summary, decisions and action items all go with it. This cannot be undone."
                confirmLabel="Delete meeting"
                destructive
                pending={del.isPending}
                onConfirm={() =>
                  del.mutate(m.id, {
                    onSuccess: () => {
                      toast.success("Meeting deleted.");
                      router.replace("/meetings");
                    },
                    onError: (e) => {
                      setDeleting(false);
                      toast.error("Couldn't delete this meeting.", {
                        description: e instanceof Error ? e.message : String(e),
                      });
                    },
                  })
                }
              />

              <p className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-[1.5] text-ink-3">
                <span>{longDate(m.started_at ?? "")}</span>
                {m.duration_s ? <span>· {duration(m.duration_s)}</span> : null}
                {m.participants.length > 0 && (
                  <span>
                    · <Participants names={m.participants} max={4} />
                  </span>
                )}
              </p>
              {m.status === "failed" && (
                <div className="mt-4 flex items-center gap-3 rounded-md border border-warn/20 bg-warn-tint px-3 py-2">
                  <span className="text-xs text-warn">{m.status_error ?? "Processing failed"}</span>
                  <button
                    type="button"
                    onClick={() => retry.mutate(m.id)}
                    className="ml-auto rounded-md bg-paper px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-card"
                  >
                    Retry
                  </button>
                </div>
              )}
              {(m.status === "transcoding" || m.status === "diarizing" || m.status === "ingesting" || m.status === "pending") && (
                <div className="mt-4 rounded-md border border-rule bg-sunk px-3 py-2 text-xs text-ink-3">
                  {m.status === "transcoding" && "Transcoding recording…"}
                  {m.status === "diarizing" && "Working out who said what…"}
                  {m.status === "ingesting" && "Saving to memory…"}
                  {m.status === "pending" && "Queued for processing…"}
                </div>
              )}
            </header>

            {/* Who and when first, then the recording. The title is what tells
                you which meeting you are in; the video is what you came to
                watch, and it reads as a subject once it is named. */}
            {bigPlayer && !noMedia && (
              <TheaterSlot>
                <RecordingPane
                  state={recording}
                  meeting={m}
                  turns={transcript.data?.turns}
                  theater
                  onToggleTheater={togglePlayerMode}
                />
              </TheaterSlot>
            )}

            <nav className="mb-7 flex gap-1.5" aria-label="Meeting views">
              <TabChip
                active={tab === "happened"}
                onClick={() => chooseTab("happened")}
              >
                Summary
              </TabChip>
              <TabChip
                active={tab === "said"}
                onClick={() => chooseTab("said")}
                count={transcript.data?.turns.length}
              >
                Transcript
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

function TheaterSlot({ children }: { children: React.ReactNode }) {
  return <div className="mb-9 w-full max-w-[calc(46vh*16/9)]">{children}</div>;
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
    <div className="pb-8">
      {meeting.summary && (
        <section className="mb-10">
          {/* Summary prose is speech reported back, so it is serif (§4). */}
          <p className="measure font-serif text-[18.5px] leading-[1.62] font-light">
            {meeting.summary}
          </p>
        </section>
      )}

      {meeting.decisions.length > 0 && (
        <section className="mb-10">
          <SectionHead>Decisions</SectionHead>
          <ul className="flex flex-col gap-5">
            {meeting.decisions.map((d) => (
              <li key={d.id}>
                <Statement item={d} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProposalSection meetingId={meeting.id} />

      {meeting.action_items.length > 0 && (
        <section className="mb-10">
          <SectionHead>Follow-ups</SectionHead>
          <Tasks meeting={meeting} me={me} />
        </section>
      )}
    </div>
  );
}

function ProposalSection({ meetingId }: { meetingId: string }) {
  const requestSeek = usePlayer((s) => s.requestSeek);
  const { data } = useMeetingActions(meetingId);
  const actions = data?.actions ?? [];

  if (actions.length === 0) return null;

  return (
    <section className="mb-10">
      <SectionHead>Needs your approval</SectionHead>
      <Proposals
        meetingId={meetingId}
        actions={actions}
        onEvidence={(startS) => requestSeek(startS)}
      />
    </section>
  );
}

async function exportMeeting(id: string) {
  try {
    const res = await fetch(
      `/api/v1/meetings/${encodeURIComponent(id)}/export?format=md`,
      { credentials: "same-origin" },
    );
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast.error("Couldn't export this meeting.", {
      description: e instanceof Error ? e.message : String(e),
    });
  }
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3.5 text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
      {children}
    </h2>
  );
}

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
  if (error instanceof ApiError && error.status === 409) {
    if (error.reason === "no_transcript") {
      return (
        <EmptyState
          title="No transcript"
          body="This meeting was added without a recording, so there is nothing to read along with."
        />
      );
    }
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
    return theater ? (
      player
    ) : (
      <div className="sticky top-0 -mx-1 px-1 pt-1">{player}</div>
    );
  }

  if (state.error instanceof ApiError && state.error.status === 409) {
    // Exception-only (§7): a meeting that simply has no video says nothing.
    if (state.error.reason === "no_media") return null;
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
