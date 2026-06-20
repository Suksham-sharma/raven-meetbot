import type { LLMProvider, JsonSchema } from "../llm/provider";
import type { TranscriptSegment } from "./chunker";
import { verifyQuote } from "./quoteGuard";

export interface ExtractedDecision {
  text: string;
  evidenceQuote: string;
  speaker: string | null;
  startS: number;
  endS: number;
}

export interface ExtractedActionItem {
  text: string;
  owner: string | null;
  due: string | null;
  evidenceQuote: string;
  speaker: string | null;
  startS: number;
  endS: number;
}

export interface ExtractedChapter {
  title: string;
  gist: string;
  startS: number;
  endS: number;
}

export interface Extraction {
  decisions: ExtractedDecision[];
  actionItems: ExtractedActionItem[];
  chapters: ExtractedChapter[];
  summary: string;
  droppedDecisions: number;
  droppedActionItems: number;
}

// Raw (snake_case) shape returned by the model, matching EXTRACTION_SCHEMA.
interface RawExtraction {
  decisions: Array<{
    text: string;
    evidence_quote: string;
    speaker: string | null;
    start_s: number;
    end_s: number;
  }>;
  action_items: Array<{
    text: string;
    owner: string | null;
    due: string | null;
    evidence_quote: string;
    speaker: string | null;
    start_s: number;
    end_s: number;
  }>;
  chapters: Array<{ title: string; gist: string; start_s: number; end_s: number }>;
  summary: string;
}

const provenanceItem = (extra: Record<string, JsonSchema>) => ({
  type: "object",
  additionalProperties: false,
  required: ["text", ...Object.keys(extra), "evidence_quote", "speaker", "start_s", "end_s"],
  properties: {
    text: { type: "string" },
    ...extra,
    evidence_quote: { type: "string" },
    speaker: { type: ["string", "null"] },
    start_s: { type: "number" },
    end_s: { type: "number" },
  },
});

const EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["decisions", "action_items", "chapters", "summary"],
  properties: {
    decisions: { type: "array", items: provenanceItem({}) },
    action_items: {
      type: "array",
      items: provenanceItem({
        owner: { type: ["string", "null"] },
        due: { type: ["string", "null"] },
      }),
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

const SYSTEM = `You extract structured records from a meeting transcript.

The transcript is lines of "[start-end] Speaker: spoken text", where start/end are seconds.

Extract:
- decisions: concrete decisions the group actually made (not topics merely raised). Give a short "text" describing the decision, the "speaker" who articulated it (or null), the "start_s"/"end_s" of the utterance it came from, and "evidence_quote".
- action_items: commitments to do something, with "owner" (responsible person, or null), "due" (stated timeframe, or null), plus text/speaker/start_s/end_s/evidence_quote.
- chapters: 1-5 topic segments spanning the meeting, each with a short "title", one-line "gist", and start_s/end_s.
- summary: a 2-4 sentence executive summary.

Rules:
- Extract ONLY what is explicitly supported by the transcript. Never infer or invent.
- "evidence_quote" MUST be the spoken words copied verbatim from one transcript line (do NOT include the "[time] Speaker:" prefix). If you cannot quote it word-for-word, omit the item.
- When a decision is revised later in the meeting, extract the most recent version.`;

// Runs structured extraction, then drops any decision/action whose evidence_quote
// is not actually in the transcript (hallucination guard).
export async function extractMeeting(
  segments: TranscriptSegment[],
  provider: LLMProvider
): Promise<Extraction> {
  const transcriptText = segments
    .map((s) => `[${s.start}-${s.end}] ${s.speaker}: ${s.text}`)
    .join("\n");
  const spokenText = segments.map((s) => s.text).join(" ");

  const raw = await provider.extract<RawExtraction>({
    system: SYSTEM,
    user: transcriptText,
    schema: EXTRACTION_SCHEMA,
    schemaName: "meeting_extraction",
  });

  const keptDecisions = raw.decisions.filter((d) => verifyQuote(d.evidence_quote, spokenText));
  const keptActions = raw.action_items.filter((a) => verifyQuote(a.evidence_quote, spokenText));

  return {
    decisions: keptDecisions.map((d) => ({
      text: d.text,
      evidenceQuote: d.evidence_quote,
      speaker: d.speaker,
      startS: d.start_s,
      endS: d.end_s,
    })),
    actionItems: keptActions.map((a) => ({
      text: a.text,
      owner: a.owner,
      due: a.due,
      evidenceQuote: a.evidence_quote,
      speaker: a.speaker,
      startS: a.start_s,
      endS: a.end_s,
    })),
    chapters: raw.chapters.map((c) => ({
      title: c.title,
      gist: c.gist,
      startS: c.start_s,
      endS: c.end_s,
    })),
    summary: raw.summary,
    droppedDecisions: raw.decisions.length - keptDecisions.length,
    droppedActionItems: raw.action_items.length - keptActions.length,
  };
}
