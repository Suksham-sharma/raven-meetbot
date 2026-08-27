import { Worker } from "bullmq";
import { getArtifactStore } from "../artifacts";
import config from "../config";
import { beginProcessing, markFailed, pool } from "../db";
import { connection, diarizeQueue, memoryQueue, type DiarizeJob } from "../queues";
import { diarizeRecording, diarizeWithoutTimeline, serializeNamedTranscript } from "./pipeline";

const worker = new Worker<DiarizeJob>(
  "diarize",
  async (job) => {
    const {
      meetingId,
      recordingKey,
      speakersKey,
      ownerId,
      title,
      scheduledStartMs,
    } = job.data;
    const log = (m: string) => console.log(`[diarize] ${meetingId}: ${m}`);
    log(`start (job ${job.id})`);

    await beginProcessing(meetingId, "diarizing", {
      ownerId,
      title,
      recordingKey,
      scheduledStartMs,
    });

    const apiKey = config.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

    const store = getArtifactStore();
    let webm: Awaited<ReturnType<typeof store.resolve>> | null = null;
    let speakers: Awaited<ReturnType<typeof store.resolve>> | null = null;
    let namedKey: string;
    try {
      webm = await store.resolve(recordingKey);
      let result;
      if (speakersKey) {
        try {
          speakers = await store.resolve(speakersKey);
          result = await diarizeRecording(webm.path, speakers.path, { apiKey, onLog: log });
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
      await markFailed(meetingId, `diarize: ${msg}`);
      throw err;
    } finally {
      if (webm) await webm.cleanup();
      if (speakers) await speakers.cleanup();
    }

    if (config.INGEST_AFTER_DIARIZE) {
      await memoryQueue.add(
        "ingest",
        { meetingId, ownerId, title, scheduledStartMs },
        { jobId: meetingId }
      );
      log("enqueued memory ingest");
    } else {
      log("INGEST_AFTER_DIARIZE=false — skipping memory ingest");
    }

    return { meetingId, namedKey, ingestEnqueued: config.INGEST_AFTER_DIARIZE };
  },
  { connection, concurrency: config.DIARIZE_WORKER_CONCURRENCY }
);

worker.on("failed", (job, err) => {
  console.error(`[diarize] job ${job?.id} (${job?.data.meetingId}) failed:`, err.message);
});

console.log(
  `[diarize] worker up, concurrency=${config.DIARIZE_WORKER_CONCURRENCY}, draining "diarize" queue`
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
