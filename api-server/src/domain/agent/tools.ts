import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { actionItems, chapters, chunks, decisions, meetings } from "../../platform/db/schema";
import type { JsonSchema, ToolSpec } from "../../platform/llm/provider";
import { hybridSearch } from "../search/hybridSearch";

const isoDate = (d: Date | null) => (d ? d.toISOString() : null);

const REF_STOP = new Set(["call", "meeting", "the", "with", "for", "and", "about", "our"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function refDate(ref: string): { month: number | null; year: number | null } {
  const lower = ref.toLowerCase();
  const month = MONTHS.findIndex((m) => lower.includes(m));
  const year = lower.match(/\b(20\d{2})\b/);
  return { month: month >= 0 ? month : null, year: year ? Number(year[1]) : null };
}

export interface MeetingMatch {
  id: string;
  title: string | null;
  score: number;
  exact: boolean;
}

// Returns RANKED candidates and never collapses silently to one: two same-named
// meetings must not be merged (the entity-confusion failure mode at corpus scale).
async function resolveMeetingMatches(
  ref: string,
  ownerId: string | null
): Promise<MeetingMatch[]> {
  const all = await db
    .select({ id: meetings.id, title: meetings.title, date: meetings.startedAt })
    .from(meetings)
    .where(ownerId ? eq(meetings.ownerId, ownerId) : undefined);

  const exactId = all.find((m) => m.id === ref);
  if (exactId) return [{ id: exactId.id, title: exactId.title, score: Infinity, exact: true }];

  const nRef = norm(ref);
  const exactTitles = all.filter((m) => m.title && norm(m.title) === nRef);

  const tokens = (nRef.match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !REF_STOP.has(t) && !MONTHS.includes(t)
  );
  const { month, year } = refDate(ref);
  const dateOf = (m: { date: Date | null }) => m.date;

  const dateFiltered =
    month !== null || year !== null
      ? all.filter((m) => {
          const d = dateOf(m);
          if (!d) return false;
          if (month !== null && d.getUTCMonth() !== month) return false;
          if (year !== null && d.getUTCFullYear() !== year) return false;
          return true;
        })
      : all;

  const exactTitleInDate = exactTitles.filter((m) => dateFiltered.some((d) => d.id === m.id));
  if (exactTitleInDate.length) {
    return exactTitleInDate.map((m) => ({ id: m.id, title: m.title, score: Infinity, exact: true }));
  }
  if (!tokens.length && (month !== null || year !== null) && dateFiltered.length === 1) {
    const m = dateFiltered[0];
    return [{ id: m.id, title: m.title, score: Infinity, exact: true }];
  }
  if (!tokens.length) {
    return exactTitles.map((m) => ({ id: m.id, title: m.title, score: Infinity, exact: true }));
  }

  return dateFiltered
    .map((m) => {
      const hay = `${m.id} ${m.title ?? ""}`.toLowerCase();
      return {
        id: m.id,
        title: m.title,
        score: tokens.filter((t) => hay.includes(t)).length,
        exact: false,
      };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function resolveMeetingType(
  t: string | undefined,
  ownerId: string | null
): Promise<string | undefined> {
  if (!t) return undefined;
  const rows = await db
    .selectDistinct({ type: meetings.type })
    .from(meetings)
    .where(ownerId ? eq(meetings.ownerId, ownerId) : undefined);
  const known = rows.map((r) => r.type?.toLowerCase()).filter(Boolean);
  return known.includes(t.toLowerCase()) ? t : undefined;
}

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

async function searchTranscript(
  a: { query: string; k?: number; meeting_id?: string; meeting_type?: string },
  ownerId: string | null
) {
  const hits = await hybridSearch(a.query, {
    k: a.k ?? 8,
    filters: {
      ownerId: ownerId ?? undefined,
      meetingId: a.meeting_id,
      meetingType: await resolveMeetingType(a.meeting_type, ownerId),
    },
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
    limit: { type: "integer", description: "max records to return (default 50, max 100)" },
  },
};

const STRUCTURED_MAX = 100;
const STRUCTURED_DEFAULT = 50;

async function searchStructured(
  a: {
    kind: "decisions" | "action_items" | "both";
    query?: string;
    meeting_id?: string;
    meeting_type?: string;
    owner?: string;
    limit?: number;
  },
  ownerId: string | null
) {
  const limit = Math.min(Math.max(a.limit ?? STRUCTURED_DEFAULT, 1), STRUCTURED_MAX);
  const meetingType = await resolveMeetingType(a.meeting_type, ownerId);
  const out: Record<string, unknown>[] = [];
  let totalMatched = 0;

  if (a.kind === "decisions" || a.kind === "both") {
    const conds = [];
    if (ownerId) conds.push(eq(meetings.ownerId, ownerId));
    if (a.meeting_id) conds.push(eq(decisions.meetingId, a.meeting_id));
    if (meetingType) conds.push(eq(meetings.type, meetingType));
    if (a.query) {
      conds.push(
        or(ilike(decisions.text, `%${a.query}%`), ilike(decisions.evidenceQuote, `%${a.query}%`))
      );
    }
    const where = conds.length ? and(...conds) : undefined;
    const [{ c }] = await db
      .select({ c: count() })
      .from(decisions)
      .innerJoin(meetings, eq(meetings.id, decisions.meetingId))
      .where(where);
    totalMatched += Number(c);
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
      .where(where)
      .orderBy(desc(meetings.startedAt))
      .limit(limit);
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
    if (ownerId) conds.push(eq(meetings.ownerId, ownerId));
    if (a.meeting_id) conds.push(eq(actionItems.meetingId, a.meeting_id));
    if (meetingType) conds.push(eq(meetings.type, meetingType));
    if (a.owner) conds.push(ilike(actionItems.owner, `%${a.owner}%`));
    if (a.query) {
      conds.push(
        or(ilike(actionItems.text, `%${a.query}%`), ilike(actionItems.evidenceQuote, `%${a.query}%`))
      );
    }
    const where = conds.length ? and(...conds) : undefined;
    const [{ c }] = await db
      .select({ c: count() })
      .from(actionItems)
      .innerJoin(meetings, eq(meetings.id, actionItems.meetingId))
      .where(where);
    totalMatched += Number(c);
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
      .where(where)
      .orderBy(desc(meetings.startedAt))
      .limit(limit);
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

  out.sort((x, y) => String(y.meeting_date ?? "").localeCompare(String(x.meeting_date ?? "")));
  const rows = out.slice(0, limit);
  const truncated = totalMatched > rows.length;
  return {
    total_matched: totalMatched,
    returned: rows.length,
    truncated,
    ...(truncated
      ? {
          hint: `Showing the ${rows.length} most recent of ${totalMatched} matching records. Narrow with owner, meeting_type, a date range (via list_meetings then meeting_id), or a query keyword to reach the rest.`,
        }
      : {}),
    rows,
  };
}

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

async function fetchMeeting(
  a: { meeting_id: string; mode?: "light" | "full" },
  ownerId: string | null
) {
  const [m] = await db
    .select()
    .from(meetings)
    .where(
      ownerId
        ? and(eq(meetings.id, a.meeting_id), eq(meetings.ownerId, ownerId))
        : eq(meetings.id, a.meeting_id)
    );
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
      meeting_id: m.id,
      title: c.title,
      gist: c.gist,
      text: c.gist ?? c.title,
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
    transcript: cks.map((c) => ({
      meeting_id: m.id,
      start_s: c.startS,
      speaker: c.speaker,
      text: c.text,
    })),
  };
}

const listMeetingsSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string", description: "ISO date lower bound on meeting date" },
    to: { type: "string", description: "ISO date upper bound on meeting date" },
    participant: { type: "string", description: "only meetings with this participant" },
    title: { type: "string", description: "loose title/name reference, e.g. 'Acme sales call'" },
    meeting_type: { type: "string" },
  },
};

async function listMeetings(
  a: { from?: string; to?: string; participant?: string; title?: string; meeting_type?: string },
  ownerId: string | null
) {
  const conds = [];
  if (ownerId) conds.push(eq(meetings.ownerId, ownerId));
  if (a.from) conds.push(gte(meetings.startedAt, new Date(a.from)));
  if (a.to) conds.push(lte(meetings.startedAt, new Date(a.to)));

  let ambiguous = false;
  if (a.title) {
    const matches = await resolveMeetingMatches(a.title, ownerId);
    if (matches.length) {
      const topScore = matches[0].score;
      const topTier = matches.filter((m) => m.score === topScore);
      ambiguous = !matches[0].exact && topTier.length > 1;
      conds.push(inArray(meetings.id, topTier.map((m) => m.id)));
    } else {
      conds.push(ilike(meetings.title, `%${a.title}%`));
    }
  }
  const meetingType = await resolveMeetingType(a.meeting_type, ownerId);
  if (meetingType) conds.push(eq(meetings.type, meetingType));
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
  const list = rows.map((r) => ({
    meeting_id: r.id,
    title: r.title,
    type: r.type,
    date: isoDate(r.date),
    participants: r.participants,
    duration_s: r.durationS,
  }));
  return { ambiguous, count: list.length, meetings: list };
}

const createActionItemSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["meeting_id", "text"],
  properties: {
    meeting_id: { type: "string", description: "the meeting this task belongs to" },
    text: { type: "string", description: "the task, as an instruction" },
    owner: { type: ["string", "null"], description: "who owes it, or null" },
    due: { type: ["string", "null"], description: "stated timeframe, or null" },
    evidence_start_s: {
      type: ["number", "null"],
      description:
        "seconds into the meeting where this came up, if you already know it from a search you ran. Pass null otherwise; do not go looking for one.",
    },
  },
};

async function createActionItem(
  a: {
    meeting_id: string;
    text: string;
    owner?: string | null;
    due?: string | null;
    evidence_start_s?: number | null;
  },
  ownerId: string | null
) {
  // Writes are owner-scoped without exception. A null ownerId is the CLI and
  // eval path, which reads across the corpus; it must never write into it.
  if (!ownerId) return { error: "creating a task requires an authenticated user" };
  if (!a.text?.trim()) return { error: "text is required" };

  const [m] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, a.meeting_id), eq(meetings.ownerId, ownerId)));
  if (!m) return { error: `no meeting with id ${a.meeting_id}` };

  // Only anchor when a timestamp was actually given. Guessing one was worse
  // than leaving it empty: matching the task text against the meeting's records
  // fired hardest when the task duplicated one that already existed, and
  // matching against chunks put a task about the clock offset on the database
  // discussion two minutes away. A task the user asked for does not need a
  // transcript moment to be trusted, because nothing about it was inferred.
  let anchor: {
    quote: string;
    speaker: string | null;
    startS: number;
    endS: number;
  } | null = null;

  if (a.evidence_start_s != null) {
    const [c] = await db
      .select({
        text: chunks.text,
        speaker: chunks.speaker,
        startS: chunks.startS,
        endS: chunks.endS,
      })
      .from(chunks)
      .where(
        and(
          eq(chunks.meetingId, a.meeting_id),
          lte(chunks.startS, a.evidence_start_s),
          gte(chunks.endS, a.evidence_start_s)
        )
      )
      .limit(1);
    if (c) {
      anchor = {
        quote: c.text.slice(0, 500),
        speaker: c.speaker,
        startS: a.evidence_start_s,
        endS: c.endS,
      };
    }
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${actionItems.seq}), -1) + 1` })
    .from(actionItems)
    .where(eq(actionItems.meetingId, a.meeting_id));

  const [row] = await db
    .insert(actionItems)
    .values({
      meetingId: a.meeting_id,
      seq: next,
      text: a.text.trim(),
      owner: a.owner ?? null,
      due: a.due ?? null,
      source: "agent",
      evidenceQuote: anchor?.quote ?? null,
      speaker: anchor?.speaker ?? null,
      startS: anchor?.startS ?? null,
      endS: anchor?.endS ?? null,
    })
    .returning();

  return {
    created: true,
    id: row.id,
    text: row.text,
    owner: row.owner,
    due: row.due,
    anchored_at_s: row.startS,
    note: anchor ? "Created, anchored to the given moment." : "Created.",
  };
}

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
      "The authoritative, deduplicated list of decisions and action_items (owner, due, verbatim evidence) extracted from meetings. ALWAYS use this FIRST for any action-item or decision question — 'what are the action items', 'who owns X', 'what's due', 'what did we decide' — for one meeting (scope with meeting_id/meeting_type) or across all. Action items are often said as casual end-of-meeting asides that transcript search ranks low, so this is the reliable source, not search_transcript. Returns { total_matched, returned, truncated, rows } NEWEST first; if truncated=true there are more than were returned — narrow by owner / meeting_type / date / query rather than assuming you have them all.",
    parameters: searchStructuredSchema,
  },
  {
    name: "fetch_meeting",
    description:
      "Get one meeting's summary + chapters (light) or also its full transcript (full). Use to go deep on a specific meeting once you know its id.",
    parameters: fetchMeetingSchema,
  },
  {
    name: "create_action_item",
    description:
      "Create a task on a meeting when the user asks for one ('add a task for Sam to...', 'remind me to...'). Only when they ask; never invent tasks from what you read. Returns the created row.",
    parameters: createActionItemSchema,
  },
  {
    name: "list_meetings",
    description:
      "Resolve / browse meetings by title, date range, participant, or type, to get the EXACT meeting_id before scoping a search. A title is matched loosely (real ids/titles are normalized). Returns { ambiguous, count, meetings: [{ meeting_id, title, date, participants, ... }] }. If ambiguous=true or count>1, several meetings matched the title — disambiguate by date/participant before searching, don't assume the first.",
    parameters: listMeetingsSchema,
  },
];

type ToolFn = (args: any, ownerId: string | null) => Promise<unknown>;
const DISPATCH: Record<string, ToolFn> = {
  search_transcript: searchTranscript,
  search_structured: searchStructured,
  fetch_meeting: fetchMeeting,
  list_meetings: listMeetings,
  create_action_item: createActionItem,
};

export async function runTool(
  name: string,
  args: unknown,
  ownerId: string | null
): Promise<unknown> {
  const fn = DISPATCH[name];
  if (!fn) return { error: `unknown tool ${name}` };
  return fn(args ?? {}, ownerId);
}
