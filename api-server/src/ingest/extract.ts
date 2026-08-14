import type { JsonSchema, LLMProvider } from "../llm/provider";
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

// Minimal universal spine. Anything type-specific (sales objections, intro asks,
// budgets, ...) is answered at query time by the agent searching the transcript —
// NOT pre-structured here. Keeps ingest simple and general across meeting types.
export interface Extraction {
  meetingType: string; // soft label: sales | intro | standup | planning | ... (not constrained)
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
interface RawExtraction {
  meeting_type: string;
  decisions: Array<RawProvenance & { text: string }>;
  action_items: Array<RawProvenance & { text: string; owner: string | null; due: string | null }>;
  chapters: Array<{ title: string; gist: string; start_s: number; end_s: number }>;
  summary: string;
}

const PROVENANCE_PROPS: Record<string, JsonSchema> = {
  evidence_quote: { type: "string" },
  speaker: { type: ["string", "null"] },
  start_s: { type: "number" },
  end_s: { type: "number" },
};
const PROVENANCE_KEYS = Object.keys(PROVENANCE_PROPS);

const EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["meeting_type", "decisions", "action_items", "chapters", "summary"],
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
    summary: { type: "string" },
  },
};

const SYSTEM = `You extract a small, universal set of structured records from a meeting transcript. Meetings vary in type (sales calls, intro/networking calls, standups, planning, interviews, 1:1s, ...) — adapt, but only extract the records below.

The transcript is lines of "[start-end] Speaker: spoken text" (seconds). It is often messy: filler words, false starts, repetition, crosstalk, and tangents.

- meeting_type: a short lowercase label for the kind of meeting (e.g. sales, intro, standup, planning, interview, one_on_one, other).
- decisions: a choice the group MADE — selecting, adopting, or rejecting something (e.g. "use Postgres", "no Friday deploys", "go with Redis"). A commitment to perform a future task is an action_item, NOT a decision; never list the same thing as both. Capture every distinct decision even if stated briefly or buried in repetition; if one is restated or revised, emit it ONCE as the final version.
- action_items: commitments to do a specific task, with owner (responsible person, or null) and due (stated timeframe, or null).
- chapters: 1-6 topic segments spanning the meeting (title, one-line gist, start_s/end_s).
- summary: a 3-5 sentence summary that captures the substance of the meeting (for a sales call, include pains/budget/next steps; for an intro, who/what/asks). This is where type-specific detail lives.

Each decision and action_item needs provenance: evidence_quote (spoken words copied verbatim from one line, WITHOUT the "[time] Speaker:" prefix), speaker, and start_s/end_s.

Rules:
- Extract ONLY what the transcript explicitly supports. Never infer or invent.
- One record per distinct item: MERGE restatements of the same decision/action — do not emit duplicates.
- Ignore off-topic tangents and small talk.
- If you cannot quote a decision/action verbatim, omit it.`;

function toProvenance(r: RawProvenance) {
  return { evidenceQuote: r.evidence_quote, speaker: r.speaker, startS: r.start_s, endS: r.end_s };
}

// Structured extraction, then drop any decision/action whose evidence_quote is not
// actually in the transcript (hallucination guard).
export async function extractMeeting(
  segments: TranscriptSegment[],
  provider: LLMProvider
): Promise<Extraction> {
  const transcriptText = segments
    .map((s) => `[${s.start}-${s.end}] ${s.speaker}: ${s.text}`)
    .join("\n");
  const spokenText = segments.map((s) => s.text).join(" ");
  const grounded = (r: RawProvenance) => verifyQuote(r.evidence_quote, spokenText);

  const raw = await provider.extract<RawExtraction>({
    system: SYSTEM,
    user: transcriptText,
    schema: EXTRACTION_SCHEMA,
    schemaName: "meeting_extraction",
  });

  const decisions = raw.decisions.filter(grounded);
  const actionItems = raw.action_items.filter(grounded);


  return {
    meetingType: raw.meeting_type,
    decisions: decisions.map((d) => ({ text: d.text, ...toProvenance(d) })),
    actionItems: actionItems.map((a) => ({
      text: a.text,
      owner: absent(a.owner),
      due: absent(a.due),
      ...toProvenance(a),
    })),
    chapters: raw.chapters.map((c) => ({
      title: c.title,
      gist: c.gist,
      startS: c.start_s,
      endS: c.end_s,
    })),
    summary: raw.summary,
    dropped: {
      decisions: raw.decisions.length - decisions.length,
      actionItems: raw.action_items.length - actionItems.length,
    },
  };
}

/**
 * `owner` and `due` are declared nullable in the schema, and the model still
 * answers "nobody said" by writing the word — 4 of 22 action items in the dev
 * corpus arrived as the string "null" and reached the UI as `null` printed
 * beside someone's task. Absence gets one representation on this side of the
 * boundary, whatever the model spelled it as.
 */
function absent(value: string | null): string | null {
  if (value == null) return null;
  const s = value.trim();
  if (!s) return null;
  return /^(null|none|n\/a|na|unknown|unspecified|tbd)$/i.test(s) ? null : s;
}
