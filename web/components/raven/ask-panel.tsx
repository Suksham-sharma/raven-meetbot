"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleNotch, Minus } from "@phosphor-icons/react";
import { api, ApiError } from "@/lib/api";
import type { Answer, AskStep, AskStreamEvent, Citation } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EvidenceFootnote, type Source } from "@/components/raven/evidence";
import { Refusal, UngroundedNotice } from "@/components/raven/states";

const OPENERS = [
  "What did we decide about pricing?",
  "What am I supposed to be doing?",
  "What came up more than once this month?",
];

const SCOPED_OPENERS = [
  "What was decided here?",
  "What did I agree to do?",
  "What was left unresolved?",
];

function describeTool(name: string, parsed: unknown): { label: string; detail: string } {
  const p = (parsed ?? {}) as Record<string, unknown>;
  switch (name) {
    case "list_meetings": {
      const parts: string[] = [];
      if (typeof p.title === "string" && p.title) parts.push(`"${p.title}"`);
      if (typeof p.participant === "string" && p.participant) parts.push(`with ${p.participant}`);
      if (typeof p.meeting_type === "string" && p.meeting_type) parts.push(p.meeting_type);
      return { label: "Finding relevant meetings", detail: parts.join(" · ") || "browsing all meetings" };
    }
    case "search_transcript": {
      const q = typeof p.query === "string" ? p.query : "";
      return { label: "Searching what was said", detail: q ? `"${q.slice(0, 42)}"` : "scanning transcripts" };
    }
    case "search_structured": {
      const kind = typeof p.kind === "string" ? p.kind : "records";
      const q = typeof p.query === "string" && p.query ? ` · "${p.query.slice(0, 32)}"` : "";
      const owner = typeof p.owner === "string" && p.owner ? ` · ${p.owner}` : "";
      return { label: "Checking decisions & tasks", detail: `${kind}${q}${owner}` };
    }
    case "fetch_meeting": {
      return {
        label: "Reading meeting details",
        detail: p.mode === "full" ? "summary and full transcript" : "summary and chapters",
      };
    }
    default:
      return { label: name, detail: "" };
  }
}

export function AskPanel({
  corpus,
  scope,
}: {
  corpus: string;
  scope?: { meetingId: string; title: string };
}) {
  const [q, setQ] = React.useState("");
  const [asked, setAsked] = React.useState("");
  const [steps, setSteps] = React.useState<AskStep[]>([]);
  const [note, setNote] = React.useState("");
  const [answer, setAnswer] = React.useState<Answer | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const idle = !isPending && !answer && !error;

  function resetStream() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSteps([]);
    setNote("");
    setAnswer(null);
    setError(null);
  }

  async function submit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isPending) return;
    resetStream();
    setQ(trimmed);
    setAsked(trimmed);
    setIsPending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let gotDone = false;
    let gotError = false;

    const handleEvent = (event: AskStreamEvent) => {
      if (controller.signal.aborted) return;
      switch (event.type) {
        case "thinking":
          setNote(event.message);
          break;
        case "tool_call": {
          const { label, detail } = describeTool(event.name, event.parsedArgs);
          setSteps((prev) => [
            ...prev,
            { id: `${event.name}-${prev.length}`, name: event.name, label, detail, status: "running" as const },
          ]);
          break;
        }
        case "tool_result": {
          setSteps((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].name === event.name && next[i].status === "running") {
                next[i] = {
                  ...next[i],
                  status: "done",
                  summary: event.summary,
                  empty: event.empty,
                };
                break;
              }
            }
            return next;
          });
          break;
        }
        case "done": {
          gotDone = true;
          setNote("");
          setError(null);
          setAnswer({
            answer: event.answer,
            citations: event.citations,
            grounded: event.grounded,
            refused: event.refused,
            retrieved_meetings: event.retrieved_meetings,
            iterations: event.iterations,
          });
          setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "done" as const } : s)));
          break;
        }
        case "error": {
          gotError = true;
          setNote("");
          setAnswer(null);
          setError(new Error(event.message));
          break;
        }
        default:
          break;
      }
    };

    const settle = (result: Answer | null, err: Error | null) => {
      if (controller.signal.aborted) return;
      setNote("");
      setAnswer(result);
      setError(err);
    };

    const runBlocking = async () => {
      try {
        settle(await api.ask(trimmed, scope?.meetingId), null);
      } catch (e) {
        settle(null, e instanceof Error ? e : new Error(String(e)));
      }
    };

    try {
      await api.askStream(trimmed, handleEvent, { meetingId: scope?.meetingId, signal: controller.signal });
      if (!gotDone && !gotError && !controller.signal.aborted) await runBlocking();
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || controller.signal.aborted) return;
      const missingRoute = e instanceof ApiError && (e.status === 404 || e.status === 405);
      if (missingRoute && !gotDone) await runBlocking();
      else settle(null, e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsPending(false);
      }
    }
  }

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-serif text-[23px] leading-tight tracking-[-0.014em]">
          {scope ? "Ask about this meeting" : "Ask across everything"}
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-3">
          {scope ? scope.title : corpus}
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
      >
        <div
          className={cn(
            "rounded-lg border bg-paper px-4 pt-3.5 pb-3",
            "transition-colors duration-150 ease-out",
            "border-field focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15",
          )}
        >
          {/* Serif: what you type is your own speech, the same rule that sets
              quotes and transcript turns. Sans would make it a search box. */}
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(q);
              }
            }}
            rows={2}
            placeholder="Ask about anything that was said…"
            aria-label={
              scope ? "Ask about this meeting" : "Ask across all your meetings"
            }
            className="w-full resize-none bg-transparent font-serif text-[17px] leading-[1.5] font-light text-ink-1 placeholder:text-ink-3 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11.5px] text-ink-3">Enter to ask</span>
            {/* Never disabled: this is the only accent anchor at rest, and a
                45%-opacity primary button reads as broken rather than waiting. */}
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isPending}
            >
              Ask
            </Button>
          </div>
        </div>
      </form>

      {!idle && (
        <div className="mt-6">
          {answer ? (
            <>
              {steps.length > 0 && <LiveSteps steps={steps} compact />}
              <div className={steps.length > 0 ? "mt-5" : ""}>
                <AnswerBlock
                  answer={answer}
                  query={asked}
                  corpus={scope ? scope.title : corpus}
                />
              </div>
            </>
          ) : error ? (
            <AskError error={error} />
          ) : (
            <LiveSteps steps={steps} note={note} />
          )}
        </div>
      )}

      {idle && <Openers onPick={submit} scoped={Boolean(scope)} />}
    </div>
  );
}

export function Openers({
  onPick,
  scoped,
}: {
  onPick: (q: string) => void;
  scoped?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-col items-start">
      <p className="mb-1 px-2 text-[12.5px] text-ink-3">
        Or start with one of these
      </p>
      {(scoped ? SCOPED_OPENERS : OPENERS).map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onPick(o)}
          className={cn(
            "group -mx-2 flex w-[calc(100%+1rem)] items-baseline gap-2 rounded-md px-2 py-2 text-left",
            "transition-colors duration-150 ease-out hover:bg-accent-tint",
          )}
        >
          <ArrowRight
            size={13}
            className="translate-y-[2px] text-ink-3 transition-colors group-hover:text-accent"
          />
          <span className="font-serif text-[15px] leading-snug font-light text-ink-2 transition-colors group-hover:text-accent">
            {o}
          </span>
        </button>
      ))}
    </div>
  );
}

const STEPS = [
  "Searching what was said",
  "Reading the meetings that matched",
  "Checking each claim against a quote",
];

export function Thinking({ from = 0 }: { from?: number }) {
  const [step, setStep] = React.useState(from);

  React.useEffect(() => {
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      4000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div aria-live="polite" className="flex flex-col gap-2.5">
      {STEPS.map((label, i) => (
        <p
          key={label}
          className={cn(
            "flex items-center gap-2 text-[13px] transition-colors duration-300",
            i === step ? "text-ink-1" : "text-ink-3",
          )}
        >
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors duration-300",
              i <= step ? "bg-accent" : "bg-ink-4",
              i === step && "motion-safe:animate-pulse",
            )}
          />
          {label}
        </p>
      ))}
    </div>
  );
}

export function LiveSteps({
  steps,
  note = "",
  compact = false,
}: {
  steps: AskStep[];
  note?: string;
  compact?: boolean;
}) {
  const shell = cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5");

  if (steps.length === 0) {
    return (
      <div role="log" aria-live="polite" className={shell}>
        <p className="flex items-center gap-2 text-[13px] text-ink-1">
          <span className="size-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
          {note || "Understanding your question"}
        </p>
      </div>
    );
  }

  return (
    <div role="log" aria-live="polite" className={shell}>
      {steps.map((s) => {
        const done = s.status === "done";
        const blank = done && s.empty;
        return (
          <div key={s.id} className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-[5px] flex size-[16px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                blank
                  ? "border-ink-4 bg-paper text-ink-3"
                  : done
                    ? "border-accent bg-accent text-white"
                    : "border-ink-4 bg-paper text-ink-4",
              )}
              aria-hidden
            >
              {blank ? (
                <Minus size={10} weight="bold" />
              ) : done ? (
                <Check size={10} weight="bold" />
              ) : (
                <CircleNotch size={10} className="motion-safe:animate-spin" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] leading-tight", done ? "text-ink-2" : "text-ink-1")}>
                {s.label}
                {s.summary && done ? (
                  <span className="font-normal text-ink-3"> — {s.summary}</span>
                ) : null}
              </p>
              {s.detail ? <p className="mt-0.5 truncate text-[11.5px] leading-tight text-ink-3">{s.detail}</p> : null}
            </div>
          </div>
        );
      })}

      {note ? (
        <div className="flex items-start gap-2.5">
          <span
            className="mt-[5px] flex size-[16px] shrink-0 items-center justify-center rounded-full border border-ink-4 bg-paper text-ink-4"
            aria-hidden
          >
            <CircleNotch size={10} className="motion-safe:animate-spin" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] leading-tight text-ink-1">{note}</p>
        </div>
      ) : null}
    </div>
  );
}

export function AnswerBlock({
  answer,
  query,
  corpus,
}: {
  answer: Answer;
  query: string;
  corpus: string;
}) {
  const router = useRouter();

  if (answer.refused)
    return <Refusal query={query} searched={`Searched ${corpus}`} />;

  return (
    <div>
      <p className="mb-4 font-serif text-[15px] leading-snug font-light text-ink-3 italic">
        {query}
      </p>
      <EvidenceFootnote
        sources={answer.citations.map(toSource)}
        onPlay={(s) =>
          s.where &&
          router.push(
            `/m/${encodeURIComponent(s.where)}?t=${Math.floor(s.at)}`,
          )
        }
      >
        {answer.answer}
      </EvidenceFootnote>
      {!answer.grounded && <UngroundedNotice />}
    </div>
  );
}

function AskError({ error }: { error: Error }) {
  const message =
    error.name === "StreamStalledError"
      ? "The connection dropped before Raven finished. Ask again."
      : error.name === "TimeoutError"
        ? "That took longer than a minute, so Raven stopped waiting. Try a narrower question."
        : error instanceof ApiError
          ? error.message
          : "Something went wrong asking that.";
  return <p className="text-[13.5px] leading-relaxed text-ink-2">{message}</p>;
}

function toSource(c: Citation): Source {
  return {
    speaker: c.speaker ?? "Someone",
    at: c.start_s,
    quote: c.text,
    where: c.meetingId,
    clipLength: Math.max(0, Math.round(c.end_s - c.start_s)),
  };
}

export function AskPanelMuted() {
  return (
    <div aria-label="Ask across everything, available once a meeting is recorded">
      <header className="mb-5">
        <h2 className="font-serif text-[23px] leading-tight tracking-[-0.014em]">
          Ask across everything
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-3">Nothing recorded yet</p>
      </header>

      <div className="rounded-lg border border-rule-lo bg-paper px-4 py-3.5">
        <p className="font-serif text-[17px] leading-[1.5] font-light text-ink-3">
          Ask about anything that was said…
        </p>
      </div>

      <div className="mt-5">
        <p className="mb-1 px-2 text-[12.5px] text-ink-3">
          The kind of thing you&rsquo;ll be able to ask
        </p>
        {OPENERS.map((o) => (
          <p
            key={o}
            className="px-2 py-2 font-serif text-[15px] leading-snug font-light text-ink-3"
          >
            {o}
          </p>
        ))}
      </div>
    </div>
  );
}
