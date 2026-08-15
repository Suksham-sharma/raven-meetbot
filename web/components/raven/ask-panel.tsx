"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleNotch } from "@phosphor-icons/react";
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

// The cross-meeting openers make no sense against a single call — "what came up
// more than once this month" has one meeting to look at.
const SCOPED_OPENERS = [
  "What was decided here?",
  "What did I agree to do?",
  "What was left unresolved?",
];

/**
 * `scope` confines the answer to one meeting. On a meeting page that is the
 * only honest behaviour: asking "what did we decide?" while looking at one call
 * and getting decisions from four others reads as the product ignoring you.
 * The heading and the boundary line say which of the two you are getting.
 */
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
      const where = typeof p.meeting_id === "string" ? ` in ${p.meeting_id.slice(0, 16)}…` : "";
      return { label: "Searching what was said", detail: q ? `"${q.slice(0, 42)}"${where}` : where.trim() || "scanning transcripts" };
    }
    case "search_structured": {
      const kind = typeof p.kind === "string" ? p.kind : "records";
      const q = typeof p.query === "string" && p.query ? ` · "${p.query.slice(0, 32)}"` : "";
      const owner = typeof p.owner === "string" && p.owner ? ` · ${p.owner}` : "";
      return { label: "Checking decisions & tasks", detail: `${kind}${q}${owner}` };
    }
    case "fetch_meeting": {
      const id = typeof p.meeting_id === "string" ? p.meeting_id : "";
      return { label: "Reading meeting details", detail: id ? id.slice(0, 28) : "" };
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
  const [answer, setAnswer] = React.useState<Answer | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [isPending, setIsPending] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const idle = !isPending && !answer && !error;

  function resetStream() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSteps([]);
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

    const handleEvent = (event: AskStreamEvent) => {
      if (controller.signal.aborted) return;
      switch (event.type) {
        case "thinking":
          // Keep a subtle current-thinking line by updating the last running step's detail,
          // but don't create a separate step for every thinking tick — tool calls are the backbone.
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
            // mark the latest running step with this name as done (last occurrence)
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].name === event.name && next[i].status === "running") {
                next[i] = { ...next[i], status: "done", summary: event.summary };
                break;
              }
            }
            return next;
          });
          break;
        }
        case "done": {
          gotDone = true;
          setAnswer({
            answer: event.answer,
            citations: event.citations,
            grounded: event.grounded,
            refused: event.refused,
            retrieved_meetings: event.retrieved_meetings,
            iterations: event.iterations,
          });
          // mark any still-running steps as done as stream ends
          setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "done" as const } : s)));
          break;
        }
        case "error": {
          setError(new Error(event.message));
          break;
        }
        default:
          break;
      }
    };

    try {
      await api.askStream(trimmed, handleEvent, { meetingId: scope?.meetingId, signal: controller.signal });
      // If stream ended without a done event (e.g. backend error without explicit done), treat as failure
      if (!gotDone && !controller.signal.aborted) {
        // Fallback to blocking call — SSE route may not be rebuilt yet
        try {
          const fallback = await api.ask(trimmed, scope?.meetingId);
          setAnswer(fallback);
        } catch (e) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      // Network or proxy error before any event — try blocking fallback once
      if (!gotDone) {
        try {
          const fallback = await api.ask(trimmed, scope?.meetingId);
          setAnswer(fallback);
          setError(null);
        } catch (fallbackErr) {
          setError(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
        }
      } else {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsPending(false);
    }
  }

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    // Everything stacks from the top; the rail scrolls as one column. This used
    // to stretch to full height with the answer slot on flex-1 and the openers
    // pinned to the bottom, which at rest opened a ~500px hole through the
    // middle of the widest empty region on the page. Nothing here needs to
    // reach the fold.
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
          {isPending && <LiveSteps steps={steps} />}
          {!isPending && error && <AskError error={error} />}
          {!isPending && answer && (
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
          )}
          {isPending && answer && (
            <AnswerBlock
              answer={answer}
              query={asked}
              corpus={scope ? scope.title : corpus}
            />
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
    // Space, not a rule: the rail already carries one hairline above the
    // commitments list, and two stacked inside 360px reads as a form.
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

// Kept for the design gallery — /design renders Thinking from fixtures.
// The live panel now uses LiveSteps with real tool-call events.
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

export function LiveSteps({ steps, compact = false }: { steps: AskStep[]; compact?: boolean }) {
  if (steps.length === 0) {
    return (
      <div aria-live="polite" className="flex flex-col gap-2.5">
        <p className="flex items-center gap-2 text-[13px] text-ink-1">
          <span className="size-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
          Understanding your question
        </p>
        <p className="flex items-center gap-2 text-[13px] text-ink-3">
          <span className="size-1.5 shrink-0 rounded-full bg-ink-4" />
          Planning which meetings to check
        </p>
      </div>
    );
  }

  return (
    <div aria-live="polite" className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
      {steps.map((s) => (
        <div key={s.id} className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-[5px] flex size-[16px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
              s.status === "done" ? "border-accent bg-accent text-white" : "border-ink-4 bg-paper text-ink-4",
            )}
            aria-hidden
          >
            {s.status === "done" ? (
              <Check size={10} weight="bold" />
            ) : (
              <CircleNotch size={10} className="motion-safe:animate-spin" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[13px] leading-tight", s.status === "done" ? "text-ink-2" : "text-ink-1")}>
              {s.label}
              {s.summary && s.status === "done" ? (
                <span className="font-normal text-ink-3"> — {s.summary}</span>
              ) : null}
            </p>
            {s.detail ? <p className="mt-0.5 truncate text-[11.5px] leading-tight text-ink-3">{s.detail}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The answer, once it lands. Exported because the design gallery renders it
 * from fixtures — /ask is a 3–40s billed round trip, which is not a loop you
 * can iterate a layout in, and a hand-copied answer in the gallery would drift
 * from this one within a week.
 */
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
        // The one move the whole product is built around: an answer resolves to
        // a person saying a thing at a time, and this is how you get there.
        // `?t=` is transcript-relative; the meeting page adds its own offset.
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
  const timedOut = error.name === "TimeoutError";
  return (
    <p className="text-[13.5px] leading-relaxed text-ink-2">
      {timedOut
        ? "That took longer than a minute, so Raven stopped waiting. Try a narrower question."
        : error instanceof ApiError
          ? error.message
          : "Something went wrong asking that."}
    </p>
  );
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
