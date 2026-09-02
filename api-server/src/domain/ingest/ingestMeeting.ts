import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../platform/db/client";
import {
  actionItems,
  chapters,
  chunks,
  decisions,
  meetings,
} from "../../platform/db/schema";
import { getArtifactStore } from "../../platform/artifacts";
import { openaiProvider } from "../../platform/llm/openai";
import type { EmbeddingProvider, LLMProvider } from "../../platform/llm/provider";
import { chunkTranscript, type TranscriptSegment } from "./chunker";
import { extractMeeting } from "./extract";
import type { MeetingMeta } from "./seedSource";

export interface IngestInput {
  meetingId: string;
  segments: TranscriptSegment[];
  meta: MeetingMeta;
  ownerId?: string | null;
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

  const extraction = await extractMeeting(segments, llm);

  const chunked = chunkTranscript(segments);

  const embeddings = await embedder.embed(chunked.map((c) => c.text));
  if (embeddings.length !== chunked.length) {
    throw new Error(
      `ingestMeeting: embedding count ${embeddings.length} != chunk count ${chunked.length}`
    );
  }

  // The other half of the transcode race: if that worker finished first there was
  // no row for it to update. Two HEADs settle it either way.
  const media = await findTranscodedMedia(meetingId);

  // Child rows are delete-then-insert so shrinking counts never leave stale rows.
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
        mp4Key: media.mp4Key,
        posterKey: media.posterKey,
        status: "ready",
        statusError: null,
      })
      .onConflictDoUpdate({
        target: meetings.id,
        set: {
          ownerId: sql`coalesce(${meetings.ownerId}, ${input.ownerId ?? null}::uuid)`,
          title: sql`coalesce(${meta.title}, ${meetings.title})`,
          type: extraction.meetingType,
          startedAt: meta.startedAt,
          endedAt: meta.endedAt,
          durationS: meta.durationS,
          participants: meta.participants,
          summary: extraction.summary,
          recordingUrl: meta.recordingUrl,
          recordingOffsetS: meta.recordingOffsetS,
          mp4Key: sql`coalesce(${meetings.mp4Key}, ${media.mp4Key})`,
          posterKey: sql`coalesce(${meetings.posterKey}, ${media.posterKey})`,
          status: "ready",
          statusError: null,
        },
      });

    // Completions are the one piece of user intent here, and the rewrite below
    // would drop them on every re-ingest. Keyed on the evidence quote, not seq:
    // seq is positional, so one extra extracted item shifts every seq beneath it
    // and the completions land on the wrong rows.
    const carried = new Map(
      (
        await tx
          .select({
            evidenceQuote: actionItems.evidenceQuote,
            completedAt: actionItems.completedAt,
          })
          .from(actionItems)
          .where(
            and(
              eq(actionItems.meetingId, meetingId),
              isNotNull(actionItems.completedAt)
            )
          )
      ).map((r) => [r.evidenceQuote, r.completedAt])
    );

    await tx.delete(chunks).where(eq(chunks.meetingId, meetingId));
    await tx.delete(chapters).where(eq(chapters.meetingId, meetingId));
    await tx.delete(decisions).where(eq(decisions.meetingId, meetingId));
    // Only what extraction produced. An agent-created task has no evidence quote
    // to be carried forward by, so an unguarded delete does not just lose its
    // completion state, it loses the row.
    await tx
      .delete(actionItems)
      .where(
        and(
          eq(actionItems.meetingId, meetingId),
          eq(actionItems.source, "extracted")
        )
      );

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

    // Extraction owns seq 0..n-1. Agent-created rows survived the delete and may
    // be sitting anywhere in that range, and seq is unique per meeting and is the
    // key propose.ts builds its maps on, so push them past the new set first.
    await tx
      .update(actionItems)
      .set({ seq: sql`${actionItems.seq} + ${1000 + extraction.actionItems.length}` })
      .where(
        and(
          eq(actionItems.meetingId, meetingId),
          ne(actionItems.source, "extracted")
        )
      );

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
          completedAt: carried.get(a.evidenceQuote) ?? null,
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

async function findTranscodedMedia(
  meetingId: string
): Promise<{ mp4Key: string | null; posterKey: string | null }> {
  const store = getArtifactStore();
  const mp4Key = `${meetingId}.mp4`;
  const posterKey = `${meetingId}.poster.jpg`;
  try {
    const [mp4, poster] = await Promise.all([
      store.exists(mp4Key),
      store.exists(posterKey),
    ]);
    return { mp4Key: mp4 ? mp4Key : null, posterKey: poster ? posterKey : null };
  } catch {
    return { mp4Key: null, posterKey: null };
  }
}
