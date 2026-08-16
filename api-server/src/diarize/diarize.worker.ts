import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import systemConfig from "../config";
import { db, pool } from "../db/client";
import { meetings } from "../db/schema";
import { diarizeQueue, memoryQueue, type DiarizeJob } from "../lib/queueManager";
import { getArtifactStore } from "./artifactStore";
import { diarizeRecording, diarizeWithoutTimeline, serializeNamedTranscript } from "./pipeline";

// v4 post-processing worker: one job = one finished recording → fetch from R2 →
// diarize (keyterms from tile names) → interval-vote name-merge → write
// {meetingId}.named-transcript.jsonl → enqueue memory ingest.
// Idempotent (overwrite + idempotent ingest), so BullMQ retries are safe.
//
// Run: pnpm worker:diarize (needs ffmpeg on PATH)

const worker = new Worker<DiarizeJob>(
  "diarize",
  async (job) => {
    const { meetingId, recordingKey, speakersKey, ownerId } = job.data;
    const log = (m: string) => console.log(`[diarize] ${meetingId}: ${m}`);
    log(`start (job ${job.id})`);

    await db
      .update(meetings)
      .set({ status: "diarizing", statusError: null })
      .where(eq(meetings.id, meetingId));

    const apiKey = systemConfig.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

    const store = getArtifactStore();
    const webm = await store.resolve(recordingKey);
    let speakers: Awaited<ReturnType<typeof store.resolve>> | null = null;
    let namedKey: string;
    try {
      let result;
      if (speakersKey) {
        try {
          speakers = await store.resolve(speakersKey);
          result = await diarizeRecording(webm.path, speakers.path, {
            apiKey,
            onLog: log,
          });
        } catch (err) {
          if (err instanceof Error && err.name === "ArtifactNotFoundError") {
            log(`speakers ${speakersKey} not found — falling back to timeline-free diarization`);
            result = await diarizeWithoutTimeline(webm.path, { apiKey, onLog: log });
          } else throw err;
        }
      } else {
        log("no speakers timeline — using timeline-free diarization");
        result = await diarizeWithoutTimeline(webm.path, { apiKey, onLog: log });
      }
      for (const a of result.assignments) {
        log(
          `Speaker ${a.speaker} → ${a.name} ` +
            `[${a.method}, conf=${(a.mappingConfidence * 100).toFixed(0)}%, ${a.utterances} utt]`
        );
      }

      namedKey = `${meetingId}.named-transcript.jsonl`;
      await store.write(namedKey, serializeNamedTranscript(result));
      log(`wrote ${result.named.length} named utterances → ${namedKey}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(meetings)
        .set({ status: "failed", statusError: `diarize: ${msg}` })
        .where(eq(meetings.id, meetingId));
      throw err;
    } finally {
      await webm.cleanup();
      if (speakers) await speakers.cleanup();
    }

    if (systemConfig.INGEST_AFTER_DIARIZE) {
      await memoryQueue.add("ingest", { meetingId, ownerId }, { jobId: meetingId });
      log("enqueued memory ingest");
    } else {
      log("INGEST_AFTER_DIARIZE=false — skipping memory ingest");
    }

    return { meetingId, namedKey, ingestEnqueued: systemConfig.INGEST_AFTER_DIARIZE };
  },
  {
    connection: { url: systemConfig.REDIS_URL },
    concurrency: systemConfig.DIARIZE_WORKER_CONCURRENCY,
  }
);

worker.on("failed", (job, err) => {
  console.error(`[diarize] job ${job?.id} (${job?.data.meetingId}) failed:`, err.message);
});

console.log(
  `[diarize] worker up, concurrency=${systemConfig.DIARIZE_WORKER_CONCURRENCY}, draining "diarize" queue`
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[diarize] received ${signal}, closing worker...`);
  await worker.close();
  await diarizeQueue.close();
  await memoryQueue.close();
  await pool.end();
  console.log("[diarize] worker closed.");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
