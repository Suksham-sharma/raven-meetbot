import type { JsonSchema, LLMProvider } from "../../platform/llm/provider";
import type { TranscriptSegment } from "./chunker";
import { verifyQuote } from "./quoteGuard";

interface Provenance {
  evidenceQuote: string;
  speaker: string | null;
  startS: number;
  endS: number;
}

export interface ExtractedDecision extends Provenance {
  text: string;
}

export interface ExtractedActionItem extends Provenance {
  text: string;
  owner: string | null;
  due: string | null;
}

export interface ExtractedChapter {
  title: string;
  gist: string;
  startS: number;
  endS: number;
}

export interface Extraction {
  meetingType: string;
  decisions: ExtractedDecision[];
  actionItems: ExtractedActionItem[];
  chapters: ExtractedChapter[];
  summary: string;
  dropped: { decisions: number; actionItems: number };
}

interface RawProvenance {
  evidence_quote: string;
  speaker: string | null;
  start_s: number;
  end_s: number;
}
interface RawRecords {
  meeting_type: string;
  decisions: Array<RawProvenance & { text: string }>;
  action_items: Array<RawProvenance & { text: string; owner: string | null; due: string | null }>;
  chapters: Array<{ title: string; gist: string; start_s: number; end_s: number }>;
}

const PROVENANCE_PROPS: Record<string, JsonSchema> = {
  evidence_quote: { type: "string" },
  speaker: { type: ["string", "null"] },
  start_s: { type: "number" },
  end_s: { type: "number" },
};
const PROVENANCE_KEYS = Object.keys(PROVENANCE_PROPS);

const RECORDS_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["meeting_type", "decisions", "action_items", "chapters"],
  properties: {
    meeting_type: { type: "string" },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", ...PROVENANCE_KEYS],
        properties: { text: { type: "string" }, ...PROVENANCE_PROPS },
      },
    },
    action_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "owner", "due", ...PROVENANCE_KEYS],
        properties: {
          text: { type: "string" },
          owner: { type: ["string", "null"] },
          due: { type: ["string", "null"] },
          ...PROVENANCE_PROPS,
        },
      },
    },
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "gist", "start_s", "end_s"],
        properties: {
          title: { type: "string" },
          gist: { type: "string" },
          start_s: { type: "number" },
          end_s: { type: "number" },
        },
      },
    },
  },
};

const SUMMARY_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary"],
  properties: { summary: { type: "string" } },
};

const RECORDS_SYSTEM = `You extract a small, universal set of structured records from a meeting transcript. Meetings vary in type (sales calls, intro/networking calls, standups, planning, interviews, 1:1s, ...) — adapt, but only extract the records below.

The transcript is lines of "[start-end] Speaker: spoken text" (seconds). It is often messy: filler words, false starts, repetition, crosstalk, and tangents.

- meeting_type: a short lowercase label for the kind of meeting (e.g. sales, intro, standup, planning, interview, one_on_one, other).
- decisions: a choice the group MADE — selecting, adopting, or rejecting something (e.g. "use Postgres", "no Friday deploys", "go with Redis"). A commitment to perform a future task is an action_item, NOT a decision; never list the same thing as both. Capture every distinct decision even if stated briefly or buried in repetition; if one is restated or revised, emit it ONCE as the final version.
- action_items: commitments to do a specific task, with owner (responsible person, or null) and due (stated timeframe, or null).
- chapters: 1-6 topic segments spanning the meeting (title, one-line gist, start_s/end_s).

Each decision and action_item needs provenance: evidence_quote (spoken words copied verbatim from one line, WITHOUT the "[time] Speaker:" prefix), speaker, and start_s/end_s.

Rules:
- Extract ONLY what the transcript explicitly supports. Never infer or invent.
- One record per distinct item: MERGE restatements of the same decision/action — do not emit duplicates.
- Ignore off-topic tangents and small talk.
- If you cannot quote a decision/action verbatim, omit it.`;

const SUMMARY_SYSTEM = `You write the recap of a meeting from its transcript.

The transcript is lines of "[start-end] Speaker: spoken text" (seconds). It is often messy: filler words, false starts, repetition, crosstalk, and tangents.

After the transcript you are given the decisions and tasks already extracted from this meeting. Those are rendered to the reader directly beneath your recap, each with its speaker, timestamp, owner and due date. The reader can see them. Reproducing them, in prose or as a list, spends the recap on the only thing they already have.

Write the reasoning instead, in paragraphs, roughly one per 8-10 minutes of transcript, minimum one. For each topic the meeting covered: what problem was raised, what options were weighed, what reasoning won, what was rejected and why. Include every number, limit, date, size, tool and system named out loud. Name who held which position where people differed, and say what was left unresolved.

Test every sentence: if the reader could get the same fact from the decisions and tasks below, cut it and write the reasoning behind it instead.

Past tense, naming people. Prose only — no headings, no bullet lists, no provenance quotes, no preamble, no closing recap of next steps.

Write ONLY what the transcript explicitly supports. Never infer or invent.`;

function renderRecords(
  decisions: ExtractedDecision[],
  actionItems: ExtractedActionItem[]
): string {
  const d = decisions.map((x) => `- ${x.text}`).join("\n") || "- (none)";
  const a =
    actionItems
      .map((x) => `- ${x.text}${x.owner ? ` [${x.owner}]` : ""}${x.due ? ` (due ${x.due})` : ""}`)
      .join("\n") || "- (none)";
  return `\n\n---\nAlready shown to the reader, do not repeat:\n\nDecisions:\n${d}\n\nTasks:\n${a}`;
}

function toProvenance(r: RawProvenance) {
  return { evidenceQuote: r.evidence_quote, speaker: r.speaker, startS: r.start_s, endS: r.end_s };
}

export async function extractMeeting(
  segments: TranscriptSegment[],
  provider: LLMProvider
): Promise<Extraction> {
  const transcriptText = segments
    .map((s) => `[${s.start}-${s.end}] ${s.speaker}: ${s.text}`)
    .join("\n");
  const spokenText = segments.map((s) => s.text).join(" ");
  const grounded = (r: RawProvenance) => verifyQuote(r.evidence_quote, spokenText);

  const raw = await provider.extract<RawRecords>({
    system: RECORDS_SYSTEM,
    user: transcriptText,
    schema: RECORDS_SCHEMA,
    schemaName: "meeting_records",
  });

  const decisions = raw.decisions.filter(grounded);
  const actionItems = raw.action_items.filter(grounded);

  const kept = {
    decisions: decisions.map((d) => ({ text: d.text, ...toProvenance(d) })),
    actionItems: actionItems.map((a) => ({
      text: a.text,
      owner: absent(a.owner),
      due: absent(a.due),
      ...toProvenance(a),
    })),
  };

  // A second call, because a model holding the decision and action_item schemas
  // renders them into the summary as well no matter how the prompt forbids it.
  // Verified across gpt-4o-mini, gpt-4o and gpt-5-mini; the same model asked for
  // a summary alone does not do it.
  const { summary } = await provider.extract<{ summary: string }>({
    system: SUMMARY_SYSTEM,
    user: transcriptText + renderRecords(kept.decisions, kept.actionItems),
    schema: SUMMARY_SCHEMA,
    schemaName: "meeting_summary",
  });

  return {
    meetingType: raw.meeting_type,
    decisions: kept.decisions,
    actionItems: kept.actionItems,
    chapters: raw.chapters.map((c) => ({
      title: c.title,
      gist: c.gist,
      startS: c.start_s,
      endS: c.end_s,
    })),
    summary,
    dropped: {
      decisions: raw.decisions.length - decisions.length,
      actionItems: raw.action_items.length - actionItems.length,
    },
  };
}

function absent(value: string | null): string | null {
  if (value == null) return null;
  const s = value.trim();
  if (!s) return null;
  return /^(null|none|n\/a|na|unknown|unspecified|tbd)$/i.test(s) ? null : s;
}
