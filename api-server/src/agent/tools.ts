import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { actionItems, chapters, chunks, decisions, meetings } from "../db/schema";
import type { JsonSchema, ToolSpec } from "../llm/provider";
import { hybridSearch } from "../search/hybridSearch";

// The four agent tools (D3). Every row a tool returns carries meeting_id +
// timestamps + meeting_date so the loop can reason about recency / superseded
// decisions and so the answer can cite an exact clip. Keys are snake_case — the
// shape the model reads and quotes back in citations.

const isoDate = (d: Date | null) => (d ? d.toISOString() : null);

// ── search_transcript ──────────────────────────────────────────────────────
const searchTranscriptSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", description: "natural-language search query" },
    k: { type: "integer", description: "how many chunks to return (default 8)" },
    meeting_id: { type: "string", description: "restrict to one meeting" },
    meeting_type: {
      type: "string",
      description: "restrict to a meeting type, e.g. sales | planning | intro",
    },
  },
};

async function searchTranscript(a: {
  query: string;
  k?: number;
  meeting_id?: string;
  meeting_type?: string;
}) {
  const hits = await hybridSearch(a.query, {
    k: a.k ?? 8,
    filters: { meetingId: a.meeting_id, meetingType: a.meeting_type },
  });
  return hits.map((h) => ({
    meeting_id: h.meetingId,
    meeting_title: h.meetingTitle,
    meeting_date: isoDate(h.meetingDate),
    speaker: h.speaker,
    start_s: h.startS,
    end_s: h.endS,
    text: h.text,
  }));
}

// ── search_structured ──────────────────────────────────────────────────────
const searchStructuredSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: {
      type: "string",
      enum: ["decisions", "action_items", "both"],
      description: "which structured records to search",
    },
    query: { type: "string", description: "optional keyword filter on the record text" },
    meeting_id: { type: "string" },
    meeting_type: { type: "string" },
    owner: { type: "string", description: "action_items only: filter by owner" },
  },
};

async function searchStructured(a: {
  kind: "decisions" | "action_items" | "both";
  query?: string;
  meeting_id?: string;
  meeting_type?: string;
  owner?: string;
}) {
  const out: Record<string, unknown>[] = [];

  if (a.kind === "decisions" || a.kind === "both") {
    const conds = [];
    if (a.meeting_id) conds.push(eq(decisions.meetingId, a.meeting_id));
    if (a.meeting_type) conds.push(eq(meetings.type, a.meeting_type));
    if (a.query) {
      conds.push(
        or(ilike(decisions.text, `%${a.query}%`), ilike(decisions.evidenceQuote, `%${a.query}%`))
      );
    }
    const rows = await db
      .select({
        meetingId: decisions.meetingId,
        title: meetings.title,
        date: meetings.startedAt,
        text: decisions.text,
        evidence: decisions.evidenceQuote,
        speaker: decisions.speaker,
        startS: decisions.startS,
        endS: decisions.endS,
      })
      .from(decisions)
      .innerJoin(meetings, eq(meetings.id, decisions.meetingId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(meetings.startedAt));
    for (const r of rows) {
      out.push({
        kind: "decision",
        meeting_id: r.meetingId,
        meeting_title: r.title,
        meeting_date: isoDate(r.date),
        text: r.text,
        evidence_quote: r.evidence,
        speaker: r.speaker,
        start_s: r.startS,
        end_s: r.endS,
      });
    }
  }

  if (a.kind === "action_items" || a.kind === "both") {
    const conds = [];
    if (a.meeting_id) conds.push(eq(actionItems.meetingId, a.meeting_id));
    if (a.meeting_type) conds.push(eq(meetings.type, a.meeting_type));
    if (a.owner) conds.push(ilike(actionItems.owner, `%${a.owner}%`));
    if (a.query) {
      conds.push(
        or(ilike(actionItems.text, `%${a.query}%`), ilike(actionItems.evidenceQuote, `%${a.query}%`))
      );
    }
    const rows = await db
      .select({
        meetingId: actionItems.meetingId,
        title: meetings.title,
        date: meetings.startedAt,
        text: actionItems.text,
        owner: actionItems.owner,
        due: actionItems.due,
        evidence: actionItems.evidenceQuote,
        speaker: actionItems.speaker,
        startS: actionItems.startS,
        endS: actionItems.endS,
      })
      .from(actionItems)
      .innerJoin(meetings, eq(meetings.id, actionItems.meetingId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(meetings.startedAt));
    for (const r of rows) {
      out.push({
        kind: "action_item",
        meeting_id: r.meetingId,
        meeting_title: r.title,
        meeting_date: isoDate(r.date),
        text: r.text,
        owner: r.owner,
        due: r.due,
        evidence_quote: r.evidence,
        speaker: r.speaker,
        start_s: r.startS,
        end_s: r.endS,
      });
    }
  }

  return out;
}

// ── fetch_meeting ──────────────────────────────────────────────────────────
const fetchMeetingSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["meeting_id"],
  properties: {
    meeting_id: { type: "string" },
    mode: {
      type: "string",
      enum: ["light", "full"],
      description: "light = summary + chapters (default); full = + the transcript",
    },
  },
};

async function fetchMeeting(a: { meeting_id: string; mode?: "light" | "full" }) {
  const [m] = await db.select().from(meetings).where(eq(meetings.id, a.meeting_id));
  if (!m) return { error: `no meeting with id ${a.meeting_id}` };

  const chs = await db
    .select()
    .from(chapters)
    .where(eq(chapters.meetingId, a.meeting_id))
    .orderBy(asc(chapters.seq));

  const base = {
    meeting_id: m.id,
    title: m.title,
    type: m.type,
    date: isoDate(m.startedAt),
    duration_s: m.durationS,
    participants: m.participants,
    summary: m.summary,
    chapters: chs.map((c) => ({
      title: c.title,
      gist: c.gist,
      start_s: c.startS,
      end_s: c.endS,
    })),
  };

  if (a.mode !== "full") return base;

  const cks = await db
    .select({ seq: chunks.seq, speaker: chunks.speaker, startS: chunks.startS, text: chunks.text })
    .from(chunks)
    .where(eq(chunks.meetingId, a.meeting_id))
    .orderBy(asc(chunks.seq));
  return {
    ...base,
    transcript: cks.map((c) => ({ start_s: c.startS, speaker: c.speaker, text: c.text })),
  };
}

// ── list_meetings ──────────────────────────────────────────────────────────
const listMeetingsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string", description: "ISO date lower bound on meeting date" },
    to: { type: "string", description: "ISO date upper bound on meeting date" },
    participant: { type: "string", description: "only meetings with this participant" },
    title: { type: "string", description: "substring match on the title" },
    meeting_type: { type: "string" },
  },
};

async function listMeetings(a: {
  from?: string;
  to?: string;
  participant?: string;
  title?: string;
  meeting_type?: string;
}) {
  const conds = [];
  if (a.from) conds.push(gte(meetings.startedAt, new Date(a.from)));
  if (a.to) conds.push(lte(meetings.startedAt, new Date(a.to)));
  if (a.title) conds.push(ilike(meetings.title, `%${a.title}%`));
  if (a.meeting_type) conds.push(eq(meetings.type, a.meeting_type));
  if (a.participant) {
    conds.push(sql`${meetings.participants} @> ${JSON.stringify([a.participant])}::jsonb`);
  }
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      type: meetings.type,
      date: meetings.startedAt,
      participants: meetings.participants,
      durationS: meetings.durationS,
    })
    .from(meetings)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(meetings.startedAt));
  return rows.map((r) => ({
    meeting_id: r.id,
    title: r.title,
    type: r.type,
    date: isoDate(r.date),
    participants: r.participants,
    duration_s: r.durationS,
  }));
}

// ── registry + dispatch ──────────────────────────────────────────────────────
export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "search_transcript",
    description:
      "Hybrid semantic + keyword search over meeting transcript chunks. Use for 'what was said about X', specifics, quotes, and anything not captured as a structured decision/action.",
    parameters: searchTranscriptSchema,
  },
  {
    name: "search_structured",
    description:
      "Search the typed decisions and action_items extracted from meetings. Use for 'what did we decide', 'open action items', 'who owns X'. Returns every matching record across meetings (good for aggregation).",
    parameters: searchStructuredSchema,
  },
  {
    name: "fetch_meeting",
    description:
      "Get one meeting's summary + chapters (light) or also its full transcript (full). Use to go deep on a specific meeting once you know its id.",
    parameters: fetchMeetingSchema,
  },
  {
    name: "list_meetings",
    description:
      "Browse meetings by date range, participant, title, or type. Use to find which meetings exist / are relevant before searching inside them.",
    parameters: listMeetingsSchema,
  },
];

type ToolFn = (args: any) => Promise<unknown>;
const DISPATCH: Record<string, ToolFn> = {
  search_transcript: searchTranscript,
  search_structured: searchStructured,
  fetch_meeting: fetchMeeting,
  list_meetings: listMeetings,
};

export async function runTool(name: string, args: unknown): Promise<unknown> {
  const fn = DISPATCH[name];
  if (!fn) return { error: `unknown tool ${name}` };
  return fn(args ?? {});
}
