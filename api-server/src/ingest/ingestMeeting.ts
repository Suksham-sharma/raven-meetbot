import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  actionItems,
  chapters,
  chunks,
  decisions,
  meetings,
} from "../db/schema";
import { openaiProvider } from "../llm/openai";
import type { EmbeddingProvider, LLMProvider } from "../llm/provider";
import { chunkTranscript, type TranscriptSegment } from "./chunker";
import { extractMeeting } from "./extract";
import type { MeetingMeta } from "./seedSource";

// One job = full ingest of one meeting (PLAN §Architecture). Idempotent on
// meeting_id: re-running replaces all derived rows, so a BullMQ retry — or an
// eval re-seed after a prompt/chunker change — is always safe. Shared by the
// memory worker (production) and the direct seed CLI (eval), so there is exactly
// one ingest path.

export interface IngestInput {
  meetingId: string;
  segments: TranscriptSegment[];
  meta: MeetingMeta;
  // Owning user, threaded from the join request; null for eval/seed ingests,
  // which land ownerless and are backfilled (seed:owner).
  ownerId?: string | null;
  // Swappable per D2; defaults to OpenAI for both generation and embeddings.
  llm?: LLMProvider;
  embedder?: EmbeddingProvider;
}

export interface IngestResult {
  meetingId: string;
  meetingType: string;
  counts: {
    chunks: number;
    decisions: number;
    actionItems: number;
    chapters: number;
  };
  dropped: { decisions: number; actionItems: number };
}

export async function ingestMeeting(input: IngestInput): Promise<IngestResult> {
  const { meetingId, segments, meta } = input;
  const llm = input.llm ?? openaiProvider;
  const embedder = input.embedder ?? openaiProvider;

  if (segments.length === 0) {
    throw new Error(`ingestMeeting: ${meetingId} has no transcript segments`);
  }

  // 1. EXTRACT the structured spine (quote-guarded inside extractMeeting).
  const extraction = await extractMeeting(segments, llm);

  // 2. CHUNK speaker-turn-aware. Baseline embeds raw chunk text; the contextual
  //    prefix (chunk.context) is eval-gated (PLAN §3) and stays null until it
  //    earns its keep on recall.
  const chunked = chunkTranscript(segments);

  // 3. EMBED all chunks in one batch call.
  const embeddings = await embedder.embed(chunked.map((c) => c.text));
  if (embeddings.length !== chunked.length) {
    throw new Error(
      `ingestMeeting: embedding count ${embeddings.length} != chunk count ${chunked.length}`
    );
  }

  // 4. UPSERT everything in one transaction. Meeting row is upserted; all child
  //    rows are delete-then-insert so shrinking counts never leave stale rows.
  await db.transaction(async (tx) => {
    await tx
      .insert(meetings)
      .values({
        id: meetingId,
        ownerId: input.ownerId ?? null,
        title: meta.title,
        type: extraction.meetingType,
        startedAt: meta.startedAt,
        endedAt: meta.endedAt,
        durationS: meta.durationS,
        participants: meta.participants,
        summary: extraction.summary,
        recordingUrl: meta.recordingUrl,
        recordingOffsetS: meta.recordingOffsetS,
        status: "ingested",
      })
      .onConflictDoUpdate({
        target: meetings.id,
        set: {
          // Ownership is sticky: an existing owner is never changed; an ownerless
          // (seed) row can still be claimed. Never orphans, never hijacks.
          ownerId: sql`coalesce(${meetings.ownerId}, ${input.ownerId ?? null}::uuid)`,
          title: meta.title,
          type: extraction.meetingType,
          startedAt: meta.startedAt,
          endedAt: meta.endedAt,
          durationS: meta.durationS,
          participants: meta.participants,
          summary: extraction.summary,
          recordingUrl: meta.recordingUrl,
          recordingOffsetS: meta.recordingOffsetS,
          status: "ingested",
        },
      });

    await tx.delete(chunks).where(eq(chunks.meetingId, meetingId));
    await tx.delete(chapters).where(eq(chapters.meetingId, meetingId));
    await tx.delete(decisions).where(eq(decisions.meetingId, meetingId));
    await tx.delete(actionItems).where(eq(actionItems.meetingId, meetingId));

    if (chunked.length > 0) {
      await tx.insert(chunks).values(
        chunked.map((c, i) => ({
          meetingId,
          seq: c.seq,
          startS: c.startS,
          endS: c.endS,
          speaker: c.speaker,
          text: c.text,
          context: null,
          type: null,
          embedding: embeddings[i],
        }))
      );
    }

    if (extraction.chapters.length > 0) {
      await tx.insert(chapters).values(
        extraction.chapters.map((c, i) => ({
          meetingId,
          seq: i,
          startS: c.startS,
          endS: c.endS,
          title: c.title,
          gist: c.gist,
        }))
      );
    }

    if (extraction.decisions.length > 0) {
      await tx.insert(decisions).values(
        extraction.decisions.map((d, i) => ({
          meetingId,
          seq: i,
          text: d.text,
          evidenceQuote: d.evidenceQuote,
          speaker: d.speaker,
          startS: d.startS,
          endS: d.endS,
        }))
      );
    }

    if (extraction.actionItems.length > 0) {
      await tx.insert(actionItems).values(
        extraction.actionItems.map((a, i) => ({
          meetingId,
          seq: i,
          text: a.text,
          owner: a.owner,
          due: a.due,
          evidenceQuote: a.evidenceQuote,
          speaker: a.speaker,
          startS: a.startS,
          endS: a.endS,
        }))
      );
    }
  });

  return {
    meetingId,
    meetingType: extraction.meetingType,
    counts: {
      chunks: chunked.length,
      decisions: extraction.decisions.length,
      actionItems: extraction.actionItems.length,
      chapters: extraction.chapters.length,
    },
    dropped: extraction.dropped,
  };
}
