import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { meetings } from "../../platform/db/schema";
import { openaiProvider } from "../../platform/llm/openai";
import type { ChatMessage, ChatProvider } from "../../platform/llm/provider";
import { runTool, TOOL_SPECS } from "./tools";

export const REFUSAL = "I couldn't find that in your meetings.";
const MAX_ITERS = 8;

export interface Citation {
  meetingId: string;
  startS: number;
  endS: number | null;
  speaker: string | null;
  text: string;
  recordingUrl: string | null;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  refused: boolean;
  iterations: number;
  toolCalls: { name: string; arguments: string }[];
  contexts: string[];
  retrievedMeetings: string[];
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

Be concise and direct. Answer in plain prose — no markdown syntax, no **bold**, no numbered or bulleted list markers. The answer renders as a reading surface, not a document, so asterisks and hashes reach the user literally.`;

function systemPrompt(): string {
  return `${SYSTEM}

TODAY'S DATE is ${new Date().toISOString().slice(0, 10)}. Resolve every relative date cue — "this month", "last week", "recently", "today", "this quarter" — against THAT date, never against your own prior. When a cue is relative, prefer letting list_meetings resolve it (title/recency cues) over building a from/to range by hand.`;
}

interface RegistryEntry {
  meetingId: string;
  startS: number;
  endS: number | null;
  speaker: string | null;
  text: string;
}

function harvest(registry: Map<string, RegistryEntry>, result: unknown): void {
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
      text: String(r.evidence_quote ?? r.text ?? ""),
    });
  }
}

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

export interface AskOptions {
  meetingId?: string | null;
  provider?: ChatProvider;
}

export type AskStreamEvent =
  | { type: "thinking"; message: string }
  | { type: "tool_call"; name: string; arguments: string; parsedArgs: unknown }
  | { type: "tool_result"; name: string; arguments: string; result: unknown; summary: string; empty: boolean }
  | { type: "answer"; answer: string }
  | { type: "done"; result: AskResult }
  | { type: "error"; message: string };

function summarizeToolResult(
  name: string,
  result: unknown
): { summary: string; empty: boolean } {
  if (Array.isArray(result)) {
    if (result.length === 0) return { summary: "no matches", empty: true };
    if (name === "search_transcript")
      return { summary: `found ${result.length} passage${result.length === 1 ? "" : "s"}`, empty: false };
    if (name === "search_structured")
      return { summary: `found ${result.length} record${result.length === 1 ? "" : "s"}`, empty: false };
    return { summary: `found ${result.length}`, empty: false };
  }
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.rows)) {
      const rows = r.rows as unknown[];
      const total = typeof r.total_matched === "number" ? r.total_matched : rows.length;
      const truncated = r.truncated === true ? ` (of ${total})` : "";
      return {
        summary: rows.length ? `found ${rows.length}${truncated}` : "no matches",
        empty: rows.length === 0,
      };
    }
    if (Array.isArray(r.meetings)) {
      const ms = r.meetings as unknown[];
      return {
        summary: ms.length ? `found ${ms.length} meeting${ms.length === 1 ? "" : "s"}` : "no matches",
        empty: ms.length === 0,
      };
    }
    if (typeof r.note === "string") return { summary: r.note.slice(0, 80), empty: true };
  }
  return { summary: "done", empty: false };
}

export async function ask(
  question: string,
  ownerId: string | null,
  options: AskOptions = {}
): Promise<AskResult> {
  const { meetingId: scope = null, provider = openaiProvider } = options;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: scope
        ? `${SYSTEM}\n\nSCOPE: answer only from meeting ${scope}. Every tool call is confined to it, so do not call list_meetings and do not ask which meeting is meant — it is this one. If this meeting does not answer the question, refuse.`
        : systemPrompt(),
    },
    { role: "user", content: question },
  ];
  const registry = new Map<string, RegistryEntry>();
  const toolCallLog: { name: string; arguments: string }[] = [];
  const seenCalls = new Set<string>();
  let listedOnce = false;

  let answer = "";
  let iterations = 0;

  for (let i = 0; i < MAX_ITERS; i++) {
    iterations = i + 1;
    // Drop list_meetings after its first call so the model physically cannot
    // re-list — a nudge alone did not stop the same-title thrash.
    const offered =
      scope || listedOnce
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
        if (scope && parsed && typeof parsed === "object") {
          (parsed as { meeting_id?: string }).meeting_id = scope;
        }
        result = await runTool(tc.name, parsed, ownerId);
        harvest(registry, result);
      }
      messages.push({
        role: "tool",
        toolCallId: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

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
      .where(
        // Registry ids already came from owner-scoped tools; re-assert the owner
        // here too so a citation can never resolve against another user's meeting.
        ownerId
          ? and(inArray(meetings.id, meetingIds), eq(meetings.ownerId, ownerId))
          : inArray(meetings.id, meetingIds)
      );
    for (const r of rows) {
      offsets.set(r.id, { offset: r.offset, url: r.url });
      meta.set(r.id, { title: r.title, date: r.date });
    }
  }

  const citations = resolveCitations(answer, registry, offsets);
  const refused = answer.trim().startsWith(REFUSAL);
  const grounded = refused || citations.length > 0;

  const cleanAnswer = answer.replace(MARKER_RE, "").replace(/\s{2,}/g, " ").trim();

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

export async function* askStream(
  question: string,
  ownerId: string | null,
  options: AskOptions = {}
): AsyncGenerator<AskStreamEvent> {
  const { meetingId: scope = null, provider = openaiProvider } = options;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: scope
        ? `${SYSTEM}\n\nSCOPE: answer only from meeting ${scope}. Every tool call is confined to it, so do not call list_meetings and do not ask which meeting is meant — it is this one. If this meeting does not answer the question, refuse.`
        : systemPrompt(),
    },
    { role: "user", content: question },
  ];
  const registry = new Map<string, RegistryEntry>();
  const toolCallLog: { name: string; arguments: string }[] = [];
  const seenCalls = new Set<string>();
  let listedOnce = false;
  let answer = "";
  let iterations = 0;

  yield { type: "thinking", message: "Understanding your question" };

  for (let i = 0; i < MAX_ITERS; i++) {
    iterations = i + 1;
    const offered =
      scope || listedOnce
        ? TOOL_SPECS.filter((t) => t.name !== "list_meetings")
        : TOOL_SPECS;

    yield {
      type: "thinking",
      message: i === 0 ? "Planning which meetings to check" : "Reading what came back",
    };

    const turn = await provider.chat({
      messages,
      tools: i < MAX_ITERS - 1 ? offered : undefined,
    });

    if (turn.toolCalls.length === 0) {
      answer = turn.content ?? "";
      if (answer) yield { type: "answer", answer: answer.replace(MARKER_RE, "").replace(/\s{2,}/g, " ").trim() };
      break;
    }

    messages.push({ role: "assistant", content: turn.content, toolCalls: turn.toolCalls });
    for (const tc of turn.toolCalls) {
      toolCallLog.push({ name: tc.name, arguments: tc.arguments });
      let parsed: unknown = {};
      try {
        parsed = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        parsed = {};
      }
      yield { type: "tool_call", name: tc.name, arguments: tc.arguments, parsedArgs: parsed };

      const sig = `${tc.name}:${tc.arguments}`;
      let result: unknown;
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
        if (scope && parsed && typeof parsed === "object") {
          (parsed as { meeting_id?: string }).meeting_id = scope;
        }
        result = await runTool(tc.name, parsed, ownerId);
        harvest(registry, result);
      }
      const { summary, empty } = summarizeToolResult(tc.name, result);
      yield { type: "tool_result", name: tc.name, arguments: tc.arguments, result, summary, empty };
      messages.push({
        role: "tool",
        toolCallId: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

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
      .where(
        ownerId
          ? and(inArray(meetings.id, meetingIds), eq(meetings.ownerId, ownerId))
          : inArray(meetings.id, meetingIds)
      );
    for (const r of rows) {
      offsets.set(r.id, { offset: r.offset, url: r.url });
      meta.set(r.id, { title: r.title, date: r.date });
    }
  }

  const citations = resolveCitations(answer, registry, offsets);
  const refused = answer.trim().startsWith(REFUSAL);
  const grounded = refused || citations.length > 0;
  const cleanAnswer = answer.replace(MARKER_RE, "").replace(/\s{2,}/g, " ").trim();
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

  const finalResult: AskResult = {
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

  yield { type: "done", result: finalResult };
}
