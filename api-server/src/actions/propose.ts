import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { actionItems, agentActions, decisions, meetings } from "../db/schema";
import { openaiProvider } from "../llm/openai";
import type { JsonSchema, LLMProvider } from "../llm/provider";
import { actionHash } from "./hash";
import { getAdapter } from "./registry";

// The v3 proposer: turns a meeting's extracted spine into PROPOSED external
// actions (status=proposed; nothing fires until approval). Deliberately a single
// structured-outputs call, not a tool loop — the input is one bounded meeting,
// and every proposal must trace to a quote-guard-verified spine row (decision /
// action_item), which is where the cite-the-moment provenance comes from. A
// proposal the model can't source is dropped, same contract as ingest.

export interface ProposeResult {
  meetingId: string;
  proposed: number;
  skipped: { unsourced: number; invalid: number; duplicate: number };
  titles: string[];
}

interface RawProposal {
  kind: "linear_issue" | "slack_message";
  title: string;
  reasoning: string;
  source_type: "action_item" | "decision" | "meeting";
  source_seq: number | null;
  issue_title: string | null;
  issue_description: string | null;
  owner: string | null;
  due: string | null;
  message_text: string | null;
}

const SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind", "title", "reasoning", "source_type", "source_seq",
          "issue_title", "issue_description", "owner", "due", "message_text",
        ],
        properties: {
          kind: { type: "string", enum: ["linear_issue", "slack_message"] },
          title: { type: "string" },
          reasoning: { type: "string" },
          source_type: { type: "string", enum: ["action_item", "decision", "meeting"] },
          source_seq: { type: ["integer", "null"] },
          issue_title: { type: ["string", "null"] },
          issue_description: { type: ["string", "null"] },
          owner: { type: ["string", "null"] },
          due: { type: ["string", "null"] },
          message_text: { type: ["string", "null"] },
        },
      },
    },
  },
};

// The LLM makes exactly one judgment: which action items are real committed
// tasks worth a tracked issue. The Slack recap is mechanical (title + date +
// spine rows) so it's templated in code, deterministically — an LLM adds only
// variance there (and gpt-4o-mini skips it outright some runs).
const SYSTEM = `You turn a finished meeting into tracked issues. You are given the meeting's summary, its extracted DECISIONS and ACTION ITEMS (numbered, with owners/due when known), and metadata.

Propose one linear_issue per ACTION ITEM that is a real committed task (someone agreed to do a specific thing). Set source_type="action_item" and source_seq to that item's number. Write a crisp issue_title (imperative, <70 chars) and an issue_description that gives the executor full context from the meeting. Copy owner/due from the item; never invent them.

Rules:
- Only propose from the provided action items. Skip vague intentions ("we should think about X"), pleasantries, courtesies ("let's connect later"), and anything without a clear task.
- Do not duplicate: one action item = one issue, even if restated.
- If nothing qualifies, propose nothing.
- reasoning: one sentence on why this action follows from the meeting.
- kind is always "linear_issue"; message_text stays null.`;

interface SpineRow {
  seq: number;
  text: string;
  evidenceQuote: string;
  startS: number;
  endS: number;
  owner?: string | null;
  due?: string | null;
}

function buildUserPrompt(
  meeting: { id: string; title: string | null; type: string | null; startedAt: Date | null; participants: unknown; summary: string | null },
  decs: SpineRow[],
  items: SpineRow[]
): string {
  const date = meeting.startedAt ? meeting.startedAt.toISOString().slice(0, 10) : "unknown";
  const lines = [
    `MEETING: ${meeting.title ?? meeting.id} (${date}, type=${meeting.type ?? "unknown"})`,
    `PARTICIPANTS: ${JSON.stringify(meeting.participants)}`,
    `SUMMARY: ${meeting.summary ?? "(none)"}`,
    "",
    "DECISIONS:",
    ...(decs.length ? decs.map((d) => `  ${d.seq}. ${d.text}`) : ["  (none)"]),
    "",
    "ACTION ITEMS:",
    ...(items.length
      ? items.map(
          (a) => `  ${a.seq}. ${a.text}${a.owner ? ` [owner: ${a.owner}]` : ""}${a.due ? ` [due: ${a.due}]` : ""}`
        )
      : ["  (none)"]),
  ];
  return lines.join("\n");
}

export async function proposeActions(
  meetingId: string,
  provider: LLMProvider = openaiProvider
): Promise<ProposeResult> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new Error(`meeting not found: ${meetingId}`);

  const decs = await db
    .select()
    .from(decisions)
    .where(eq(decisions.meetingId, meetingId))
    .orderBy(asc(decisions.seq));
  const items = await db
    .select()
    .from(actionItems)
    .where(eq(actionItems.meetingId, meetingId))
    .orderBy(asc(actionItems.seq));

  const skipped = { unsourced: 0, invalid: 0, duplicate: 0 };
  if (decs.length === 0 && items.length === 0) {
    return { meetingId, proposed: 0, skipped, titles: [] };
  }

  const raw = await provider.extract<{ actions: RawProposal[] }>({
    system: SYSTEM,
    user: buildUserPrompt(meeting, decs, items),
    schema: SCHEMA,
    schemaName: "proposed_actions",
  });

  const bySeq = {
    action_item: new Map(items.map((r) => [r.seq, r])),
    decision: new Map(decs.map((r) => [r.seq, r])),
  };

  const rows: (typeof agentActions.$inferInsert)[] = [];
  const titles: string[] = [];
  for (const p of raw.actions) {
    const payload =
      p.kind === "linear_issue"
        ? {
            issue_title: p.issue_title ?? "",
            description: p.issue_description ?? "",
            owner: p.owner,
            due: p.due,
          }
        : { text: p.message_text ?? "" };

    const adapter = getAdapter(p.kind);
    const invalid = adapter ? adapter.validate(payload) : "unknown kind";
    if (invalid) {
      skipped.invalid++;
      continue;
    }

    // Evidence: the quote-guard-verified spine row. A linear_issue MUST trace to
    // one; the recap's evidence is the meeting itself (no single quote).
    let evidence: { quote: string; startS: number; endS: number } | null = null;
    if (p.source_type !== "meeting") {
      const src = bySeq[p.source_type].get(p.source_seq ?? -1);
      if (!src) {
        skipped.unsourced++;
        continue;
      }
      evidence = { quote: src.evidenceQuote, startS: src.startS, endS: src.endS };
    } else if (p.kind === "linear_issue") {
      skipped.unsourced++;
      continue;
    }

    const title = p.title.trim() || (adapter ? adapter.describe(payload as never) : p.kind);
    rows.push({
      meetingId,
      kind: p.kind,
      title,
      payload,
      reasoning: p.reasoning,
      evidenceQuote: evidence?.quote ?? null,
      evidenceStartS: evidence?.startS ?? null,
      evidenceEndS: evidence?.endS ?? null,
      actionHash: actionHash(meetingId, p.kind, evidence?.quote ?? null),
    });
    titles.push(title);
  }

  // Deterministic recap — templated from the spine, one per meeting (evidence-less
  // hash). The LLM never gets a vote on whether the team hears about the meeting.
  const date = meeting.startedAt ? meeting.startedAt.toISOString().slice(0, 10) : "unknown date";
  const recapLines = [
    `Meeting recap: ${meeting.title ?? meeting.id} (${date})`,
    "",
    ...(decs.length ? ["Decisions:", ...decs.map((d) => `• ${d.text}`), ""] : []),
    ...(items.length
      ? [
          "Action items:",
          ...items.map(
            (a) => `• ${a.text}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (due ${a.due})` : ""}`
          ),
        ]
      : []),
  ];
  const recapPayload = { text: recapLines.join("\n").trim() };
  const recapTitle = `Post recap of "${meeting.title ?? meeting.id}" to Slack`;
  rows.push({
    meetingId,
    kind: "slack_message",
    title: recapTitle,
    payload: recapPayload,
    reasoning: "Recap the meeting's decisions and action items for the team channel.",
    evidenceQuote: null,
    evidenceStartS: null,
    evidenceEndS: null,
    actionHash: actionHash(meetingId, "slack_message", null),
  });
  titles.push(recapTitle);

  let proposed = 0;
  if (rows.length) {
    const inserted = await db
      .insert(agentActions)
      .values(rows)
      .onConflictDoNothing({ target: agentActions.actionHash })
      .returning({ id: agentActions.id });
    proposed = inserted.length;
    skipped.duplicate = rows.length - proposed;
  }

  return { meetingId, proposed, skipped, titles };
}
