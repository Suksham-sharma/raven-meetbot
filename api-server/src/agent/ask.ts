import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import { meetings } from "../db/schema";
import { openaiProvider } from "../llm/openai";
import type { ChatMessage, ChatProvider } from "../llm/provider";
import { runTool, TOOL_SPECS } from "./tools";

// The agentic /ask loop (PLAN §4). OpenAI function-calling, bounded iterations.
// The loop plans → calls a tool → reads → maybe calls another → then answers.
// Cite-or-refuse: every answer cites source clips ([[meeting_id@start_s]]) or is
// the explicit refusal; an answer with neither is flagged ungrounded.

export const REFUSAL = "I couldn't find that in your meetings.";
const MAX_ITERS = 8;

export interface Citation {
  meetingId: string;
  startS: number;
  endS: number | null;
  speaker: string | null;
  text: string;
  recordingUrl: string | null; // deep link with #t= when a recording exists
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  grounded: boolean; // has ≥1 resolved citation OR is an explicit refusal
  refused: boolean;
  iterations: number;
  toolCalls: { name: string; arguments: string }[];
  contexts: string[]; // retrieved texts that informed the answer (for Ragas)
  retrievedMeetings: string[];
  // Every piece of evidence the loop actually gathered, with its meeting +
  // timespan — regardless of which tool surfaced it (a transcript chunk or a
  // structured decision/action row). The evidence-recall eval scores whether
  // this covers the labeled answer, so it credits the spine route as well as
  // the transcript route (agent-path retrieval quality, not just chunk search).
  evidence: { meetingId: string; startS: number; endS: number | null }[];
}

const SYSTEM = `You are a meeting-memory assistant. Answer the user's question using ONLY information returned by your tools — never your own assumptions or outside knowledge.

Tools:
- search_transcript: semantic + keyword search over what was actually said.
- search_structured: the typed, deduplicated list of decisions and action_items (with owners + due dates + verbatim evidence) extracted from meetings.
- fetch_meeting: one meeting's summary/chapters, or its full transcript.
- list_meetings: browse which meetings exist (by date, participant, title, type).

How to work:
- For a question about a SPECIFIC meeting, company, or person, FIRST call list_meetings (filter by title/participant/date) to get the real meeting_id, then pass that exact id to the search tools. NEVER invent a meeting_id — only ever use one that appeared verbatim in a list_meetings result.
- When list_meetings returns MULTIPLE candidates (e.g. two calls with the same company), NEVER refuse and never stop just because more than one matched — pick the right one from the QUESTION'S OWN cues:
   • an explicit date/month ("the July call", "in June") → put that word straight into the list_meetings title (e.g. title="June Acme") — it resolves the date for you; do NOT build from/to date ranges with a guessed year;
   • "current" / "latest" / "now" / "today" / "most recent" → the NEWEST meeting (compare dates);
   • "original" / "first" / "initial" / "discovery" → the EARLIEST; "follow-up" / "second" → the later one;
   • a question that aggregates "across" the calls or asks for every X → use ALL the matching meetings;
   • no cue but a single answer is needed → default to the MOST RECENT matching meeting and state which one you used.
  Only ask for clarification as a last resort, when choosing wrong would actually change the answer and there is no usable cue. Resolve to a real meeting_id and proceed — do not return an empty answer.
- ACTION-ITEM and DECISION questions — "what are the action items", "who owns X", "what's due", "what did we decide about Y", "all open action items" — get the decision/action itself from search_structured, the authoritative deduplicated list with owners + provenance (action items especially are NOT reliable via transcript search — they're often casual end-of-meeting asides). The structured row gives the WHAT; for the WHY, the reasoning, or a contrast/superseded detail ("...and why", "what changed", specifics), ALSO run search_transcript on the topic and fold that in — don't answer a "why"/"what changed" question from the bare structured row alone. For "across all meetings" aggregation call search_structured unfiltered (or by meeting_type); for one meeting scope it with the id from list_meetings.
- Plan, call one or more tools, read the results, and call more tools if needed before answering. For "across all meetings" or aggregation questions, gather from every relevant meeting.
- If a filtered tool call returns nothing, BROADEN it (drop the meeting_id/query filter and re-call, or try the other search tool) before concluding the answer isn't in your meetings.
- search_structured's "query" is a keyword filter on the record TEXT (e.g. "rate limit"), NOT a company or meeting name — to scope to a company/meeting use meeting_id (from list_meetings) or meeting_type, never query="Acme".
- search_structured returns NEWEST records first and is capped. If its result has truncated=true, you do NOT have the full set — narrow with owner, meeting_type, a date range, or a query keyword (or say your list covers the most recent N of total_matched). Never imply completeness over a truncated result.
- Answer a specific-meeting question ONLY from that meeting's rows — don't mix in others.
- Never repeat the same tool call. ONE list_meetings is enough to see what exists; listing alone never answers a content question — to read what was said or decided you MUST call search_transcript or search_structured.
- For "how did X evolve / change" questions: search the topic (search_transcript and/or search_structured) across meetings, order what you find by date, and describe what changed from the earliest mention to the latest.
- Every tool result includes meeting_id, a date, and start_s timestamps. When decisions conflict, trust the MOST RECENT meeting (compare dates) and say what changed.

Citing — REQUIRED:
- Support every factual claim with a citation of the EXACT form [[meeting_id@start_s]] — both parts, copied verbatim from the tool result you used, e.g. [[arch-review_2026-06-17_10-00-00@143.2]]. Put it right after the claim. The @start_s is mandatory; never write [[meeting_id]] alone.
- Only cite results you actually retrieved.

Before you answer, verify the retrieved results actually address the SPECIFIC thing asked. A weak, tangential, or loosely-related match is NOT an answer. Adjacent information is NOT the thing asked: if the exact topic/metric/decision asked about was never discussed (e.g. "pricing tiers" when only budgets and per-seat counts were mentioned), refuse — do NOT stretch related material into an answer. If nothing in your meetings directly addresses the question, reply with EXACTLY this and nothing else:
${REFUSAL}

Be concise and direct.`;

interface RegistryEntry {
  meetingId: string;
  startS: number;
  endS: number | null;
  speaker: string | null;
  text: string;
}

// Harvest any tool-result item that has a meeting_id + start_s into the citation
// registry, keyed by meeting_id@rounded-start so a marker resolves to real data.
function harvest(registry: Map<string, RegistryEntry>, result: unknown): void {
  // Unwrap container results (search_structured → { rows: [...] }, list_meetings →
  // { meetings: [...] }) so the rows inside still feed the citation registry.
  let items: unknown[];
  if (Array.isArray(result)) {
    items = result;
  } else if (result && typeof result === "object") {
    const arrays = Object.values(result as Record<string, unknown>).filter(Array.isArray);
    items = arrays.length ? (arrays.flat() as unknown[]) : [result];
  } else {
    items = [result];
  }
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    if (typeof r.meeting_id !== "string" || typeof r.start_s !== "number") continue;
    const key = `${r.meeting_id}@${Math.round(r.start_s)}`;
    registry.set(key, {
      meetingId: r.meeting_id,
      startS: r.start_s,
      endS: typeof r.end_s === "number" ? r.end_s : null,
      speaker: typeof r.speaker === "string" ? r.speaker : null,
      // evidence_quote is the verbatim clip for structured records; else the text.
      text: String(r.evidence_quote ?? r.text ?? ""),
    });
  }
}

// Accepts the precise form [[id@start_s]] and the bare fallback [[id]] (the model
// occasionally drops the timestamp) — the bare form resolves to the most-relevant
// retrieved clip for that meeting (registry is harvested in relevance order).
const MARKER_RE = /\[\[([^\]@]+?)(?:@([\d.]+))?\]\]/g;

function resolveCitations(
  answer: string,
  registry: Map<string, RegistryEntry>,
  offsets: Map<string, { offset: number; url: string | null }>
): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const m of answer.matchAll(MARKER_RE)) {
    const meetingId = m[1].trim();
    const start = m[2] !== undefined ? parseFloat(m[2]) : null;
    // Timestamped: nearest registry entry within 3s. Bare: first (top-relevance).
    let best: RegistryEntry | undefined;
    let bestD = Infinity;
    for (const e of registry.values()) {
      if (e.meetingId !== meetingId) continue;
      if (start === null) {
        best = e;
        break;
      }
      const d = Math.abs(e.startS - start);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) continue;
    if (start !== null && bestD > 3) continue;
    const dedupe = `${best.meetingId}@${Math.round(best.startS)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const off = offsets.get(best.meetingId);
    const clip = best.startS + (off?.offset ?? 0);
    out.push({
      meetingId: best.meetingId,
      startS: best.startS,
      endS: best.endS,
      speaker: best.speaker,
      text: best.text,
      recordingUrl: off?.url ? `${off.url}#t=${clip}` : null,
    });
  }
  return out;
}

export async function ask(
  question: string,
  provider: ChatProvider = openaiProvider
): Promise<AskResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: question },
  ];
  const registry = new Map<string, RegistryEntry>();
  const toolCallLog: { name: string; arguments: string }[] = [];
  // Progress guard: short-circuit an identical repeated tool call (same name +
  // args) so the loop can't spin on e.g. list_meetings and starve itself.
  const seenCalls = new Set<string>();
  // list_meetings is discovery — allowed once; further calls are nudged to proceed.
  let listedOnce = false;

  let answer = "";
  let iterations = 0;

  for (let i = 0; i < MAX_ITERS; i++) {
    iterations = i + 1;
    // list_meetings is discovery — offer it ONCE. After the first call, drop it
    // from the toolset so the model physically cannot re-list (a nudge alone didn't
    // stop the same-title thrash); it must pick a meeting_id from what it already
    // saw and search. Last iteration: drop all tools to force a final answer.
    const offered = listedOnce
      ? TOOL_SPECS.filter((t) => t.name !== "list_meetings")
      : TOOL_SPECS;
    const turn = await provider.chat({
      messages,
      tools: i < MAX_ITERS - 1 ? offered : undefined,
    });

    if (turn.toolCalls.length === 0) {
      answer = turn.content ?? "";
      break;
    }

    messages.push({ role: "assistant", content: turn.content, toolCalls: turn.toolCalls });
    for (const tc of turn.toolCalls) {
      toolCallLog.push({ name: tc.name, arguments: tc.arguments });
      const sig = `${tc.name}:${tc.arguments}`;
      let result: unknown;
      // Loop-breaker: list_meetings is discovery, called once. Re-listing (even with
      // new filters) is the thrash we see when the model can't decide between two
      // same-title meetings — short-circuit it and force a pick + content search,
      // so an ambiguous title can't starve the loop into an empty refusal.
      if (tc.name === "list_meetings" && listedOnce) {
        result = {
          note: "You already listed meetings. Do NOT list again. From those results, PICK the one meeting_id that fits the question's date/recency cue (e.g. an explicit month → that date; 'current/latest' → newest; 'original/first' → earliest; otherwise newest), then call search_transcript or search_structured with that meeting_id now.",
        };
      } else if (seenCalls.has(sig)) {
        result = {
          note: "You already called this exact tool with these arguments. Use a DIFFERENT tool or arguments — to read meeting content call search_transcript or search_structured, then answer.",
        };
      } else {
        if (tc.name === "list_meetings") listedOnce = true;
        seenCalls.add(sig);
        let parsed: unknown = {};
        try {
          parsed = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch {
          parsed = {};
        }
        result = await runTool(tc.name, parsed);
        harvest(registry, result);
      }
      messages.push({
        role: "tool",
        toolCallId: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Resolve citations against the meetings actually retrieved.
  const meetingIds = [...new Set([...registry.values()].map((e) => e.meetingId))];
  const offsets = new Map<string, { offset: number; url: string | null }>();
  const meta = new Map<string, { title: string | null; date: Date | null }>();
  if (meetingIds.length) {
    const rows = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        date: meetings.startedAt,
        offset: meetings.recordingOffsetS,
        url: meetings.recordingUrl,
      })
      .from(meetings)
      .where(inArray(meetings.id, meetingIds));
    for (const r of rows) {
      offsets.set(r.id, { offset: r.offset, url: r.url });
      meta.set(r.id, { title: r.title, date: r.date });
    }
  }

  const citations = resolveCitations(answer, registry, offsets);
  const refused = answer.trim().startsWith(REFUSAL);
  const grounded = refused || citations.length > 0;

  // Strip raw markers from the user-facing answer (citations carry the data).
  const cleanAnswer = answer.replace(MARKER_RE, "").replace(/\s{2,}/g, " ").trim();

  // Contexts for the faithfulness judge carry their PROVENANCE (meeting, date,
  // speaker, timestamp), not just the bare quote — otherwise a grounded attribution
  // ("decided in the arch review on 2026-06-17", "Sam said") gets falsely scored as
  // an unsupported claim because the metadata the agent legitimately saw was
  // stripped. Same enriched contexts feed Ragas, so both judges score apples-to-apples.
  const contexts = [
    ...new Map(
      [...registry.values()].map((e) => {
        const m = meta.get(e.meetingId);
        const date = m?.date ? m.date.toISOString().slice(0, 10) : "unknown date";
        const tag = `[meeting "${m?.title ?? e.meetingId}" (${date}) | ${e.speaker ?? "speaker"} @${e.startS}s]`;
        return [`${e.meetingId}@${Math.round(e.startS)}`, `${tag} ${e.text}`];
      })
    ).values(),
  ];

  return {
    answer: cleanAnswer,
    citations,
    grounded,
    refused,
    iterations,
    toolCalls: toolCallLog,
    contexts,
    retrievedMeetings: meetingIds,
    evidence: [...registry.values()].map((e) => ({
      meetingId: e.meetingId,
      startS: e.startS,
      endS: e.endS,
    })),
  };
}
