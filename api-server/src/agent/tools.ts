import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { actionItems, chapters, chunks, decisions, meetings } from "../db/schema";
import type { JsonSchema, ToolSpec } from "../llm/provider";
import { hybridSearch } from "../search/hybridSearch";

// The four agent tools (D3). Every row a tool returns carries meeting_id +
// timestamps + meeting_date so the loop can reason about recency / superseded
// decisions and so the answer can cite an exact clip. Keys are snake_case — the
// shape the model reads and quotes back in citations.

const isoDate = (d: Date | null) => (d ? d.toISOString() : null);

// Generic words that carry no meeting identity — ignored when matching a fuzzy
// reference so they can't pull in the wrong meeting.
const REF_STOP = new Set(["call", "meeting", "the", "with", "for", "and", "about", "our"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Pull a month (0-11) and/or 4-digit year out of a natural reference so a date
// word can disambiguate same-title meetings — "July Acme" must beat "June Acme",
// even though ids/titles store the date numerically ("2026-07-10"), where "july"
// never substring-matches. Returns nulls when no date cue is present.
function refDate(ref: string): { month: number | null; year: number | null } {
  const lower = ref.toLowerCase();
  const month = MONTHS.findIndex((m) => lower.includes(m));
  const year = lower.match(/\b(20\d{2})\b/);
  return { month: month >= 0 ? month : null, year: year ? Number(year[1]) : null };
}

export interface MeetingMatch {
  id: string;
  title: string | null;
  score: number; // token-overlap count; Infinity for an exact id/title match
  exact: boolean;
}

// Resolve a possibly-fuzzy meeting reference to RANKED candidates — never collapse
// silently to one. The model (like a user) names a meeting naturally ("Acme sales
// call", "the July Acme call") but ids/titles are normalized ("sales-acme_2026-06-19...",
// "sales acme"). Precedence: exact id → exact normalized title → token overlap, with
// a month/year cue in the reference filtering to meetings on that date (so two
// same-title calls disambiguate by date). The caller (list_meetings) surfaces
// remaining ambiguity rather than arbitrarily picking — two same-named meetings must
// NOT be silently merged (the entity-confusion failure mode at corpus scale).
async function resolveMeetingMatches(ref: string): Promise<MeetingMatch[]> {
  const all = await db
    .select({ id: meetings.id, title: meetings.title, date: meetings.startedAt })
    .from(meetings);

  const exactId = all.find((m) => m.id === ref);
  if (exactId) return [{ id: exactId.id, title: exactId.title, score: Infinity, exact: true }];

  const nRef = norm(ref);
  const exactTitles = all.filter((m) => m.title && norm(m.title) === nRef);

  const tokens = (nRef.match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !REF_STOP.has(t) && !MONTHS.includes(t)
  );
  const { month, year } = refDate(ref);
  const dateOf = (m: { date: Date | null }) => m.date;

  // A date cue narrows candidates to meetings on that month/year before scoring.
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

  // Exact title within the date-filtered set is the strongest signal.
  const exactTitleInDate = exactTitles.filter((m) => dateFiltered.some((d) => d.id === m.id));
  if (exactTitleInDate.length) {
    return exactTitleInDate.map((m) => ({ id: m.id, title: m.title, score: Infinity, exact: true }));
  }
  // A date cue with exactly one title-or-token match collapses to that meeting.
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
    limit: { type: "integer", description: "max records to return (default 50, max 100)" },
  },
};

// Bounded so "everything across all meetings" can't blow the context window at
// scale (hundreds of meetings → thousands of rows). Records are returned NEWEST
// first, capped, and the result reports total_matched + truncated + a hint to
// narrow — an HONEST cap (no silent drop): the agent is told there's more and how
// to scope (owner / meeting_type / date / query) rather than getting a lie about
// coverage. Aggregation that needs the full set must filter, which is also the
// right product behavior (nobody wants a 2,000-item list).
const STRUCTURED_MAX = 100;
const STRUCTURED_DEFAULT = 50;

async function searchStructured(a: {
  kind: "decisions" | "action_items" | "both";
  query?: string;
  meeting_id?: string;
  meeting_type?: string;
  owner?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(a.limit ?? STRUCTURED_DEFAULT, 1), STRUCTURED_MAX);
  const out: Record<string, unknown>[] = [];
  let totalMatched = 0;

  if (a.kind === "decisions" || a.kind === "both") {
    const conds = [];
    if (a.meeting_id) conds.push(eq(decisions.meetingId, a.meeting_id));
    if (a.meeting_type) conds.push(eq(meetings.type, a.meeting_type));
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
    if (a.meeting_id) conds.push(eq(actionItems.meetingId, a.meeting_id));
    if (a.meeting_type) conds.push(eq(meetings.type, a.meeting_type));
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

  // Newest first, then cap the combined set (each leg was capped individually too).
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
    // Each chapter carries meeting_id + start_s + text so the loop's citation
    // harvester registers it — otherwise a summary answer built from fetch_meeting
    // has nothing to cite and comes out ungrounded (cite-or-refuse hole on
    // open-ended "summarize X" questions). text = the gist (the citable clip).
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
    // meeting_id on each line so full-mode transcript clips are citable too.
    transcript: cks.map((c) => ({
      meeting_id: m.id,
      start_s: c.startS,
      speaker: c.speaker,
      text: c.text,
    })),
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
    title: { type: "string", description: "loose title/name reference, e.g. 'Acme sales call'" },
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

  // Discovery tool ("ls"): a title is a loose reference resolved to RANKED
  // candidates. When several tie at the top (e.g. two "sales acme" calls), surface
  // ALL of them and set ambiguous=true so the agent disambiguates by date/participant
  // instead of silently scoping to the wrong one. Fall back to substring if nothing
  // overlaps. Returns the REAL id the agent then passes verbatim to the scoped tools.
  let ambiguous = false;
  if (a.title) {
    const matches = await resolveMeetingMatches(a.title);
    if (matches.length) {
      const topScore = matches[0].score;
      const topTier = matches.filter((m) => m.score === topScore);
      ambiguous = !matches[0].exact && topTier.length > 1;
      conds.push(inArray(meetings.id, topTier.map((m) => m.id)));
    } else {
      conds.push(ilike(meetings.title, `%${a.title}%`));
    }
  }
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
  const list = rows.map((r) => ({
    meeting_id: r.id,
    title: r.title,
    type: r.type,
    date: isoDate(r.date),
    participants: r.participants,
    duration_s: r.durationS,
  }));
  // ambiguous=true tells the agent these candidates tied on the title reference —
  // pick by date/participant (or ask) rather than assuming the first is right.
  return { ambiguous, count: list.length, meetings: list };
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
    name: "list_meetings",
    description:
      "Resolve / browse meetings by title, date range, participant, or type, to get the EXACT meeting_id before scoping a search. A title is matched loosely (real ids/titles are normalized). Returns { ambiguous, count, meetings: [{ meeting_id, title, date, participants, ... }] }. If ambiguous=true or count>1, several meetings matched the title — disambiguate by date/participant before searching, don't assume the first.",
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
