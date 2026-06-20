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
}

const SYSTEM = `You are a meeting-memory assistant. Answer the user's question using ONLY information returned by your tools — never your own assumptions or outside knowledge.

Tools:
- search_transcript: semantic + keyword search over what was actually said.
- search_structured: the typed decisions and action_items (best for "what did we decide", "open action items", "who owns X", and aggregation across meetings).
- fetch_meeting: one meeting's summary/chapters, or its full transcript.
- list_meetings: browse which meetings exist (by date, participant, title, type).

How to work:
- Plan, call one or more tools, read the results, and call more tools if needed before answering. For "across all meetings" or aggregation questions, gather from every relevant meeting.
- If the question is about a specific company, person, or meeting, FIRST identify the right meeting(s) (use list_meetings, or scope search_transcript with meeting_id) and answer ONLY from those — do not mix in other meetings.
- Never repeat the same tool call. ONE list_meetings is enough to see what exists; listing alone never answers a content question — to read what was said or decided you MUST call search_transcript or search_structured.
- For "how did X evolve / change" questions: search the topic (search_transcript and/or search_structured) across meetings, order what you find by date, and describe what changed from the earliest mention to the latest.
- Every tool result includes meeting_id, a date, and start_s timestamps. When decisions conflict, trust the MOST RECENT meeting (compare dates) and say what changed.

Citing — REQUIRED:
- Support every factual claim with a citation of the EXACT form [[meeting_id@start_s]] — both parts, copied verbatim from the tool result you used, e.g. [[arch-review_2026-06-17_10-00-00@143.2]]. Put it right after the claim. The @start_s is mandatory; never write [[meeting_id]] alone.
- Only cite results you actually retrieved.

Before you answer, verify the retrieved results actually address the SPECIFIC thing asked. A weak, tangential, or loosely-related match is NOT an answer. If nothing in your meetings directly addresses the question, reply with EXACTLY this and nothing else:
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
  const items = Array.isArray(result) ? result : [result];
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

  let answer = "";
  let iterations = 0;

  for (let i = 0; i < MAX_ITERS; i++) {
    iterations = i + 1;
    // Last iteration: drop tools to force a final textual answer.
    const turn = await provider.chat({
      messages,
      tools: i < MAX_ITERS - 1 ? TOOL_SPECS : undefined,
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
      if (seenCalls.has(sig)) {
        result = {
          note: "You already called this exact tool with these arguments. Use a DIFFERENT tool or arguments — to read meeting content call search_transcript or search_structured, then answer.",
        };
      } else {
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
  if (meetingIds.length) {
    const rows = await db
      .select({
        id: meetings.id,
        offset: meetings.recordingOffsetS,
        url: meetings.recordingUrl,
      })
      .from(meetings)
      .where(inArray(meetings.id, meetingIds));
    for (const r of rows) offsets.set(r.id, { offset: r.offset, url: r.url });
  }

  const citations = resolveCitations(answer, registry, offsets);
  const refused = answer.trim().startsWith(REFUSAL);
  const grounded = refused || citations.length > 0;

  // Strip raw markers from the user-facing answer (citations carry the data).
  const cleanAnswer = answer.replace(MARKER_RE, "").replace(/\s{2,}/g, " ").trim();

  return {
    answer: cleanAnswer,
    citations,
    grounded,
    refused,
    iterations,
    toolCalls: toolCallLog,
    contexts: [...new Set([...registry.values()].map((e) => e.text))],
    retrievedMeetings: meetingIds,
  };
}
