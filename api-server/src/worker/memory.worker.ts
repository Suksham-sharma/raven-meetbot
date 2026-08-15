import { Worker } from "bullmq";
import systemConfig from "../config";
import { db, pool } from "../db/client";
import { ArtifactNotFoundError, getArtifactStore } from "../diarize/artifactStore";
import { ingestMeeting } from "../ingest/ingestMeeting";
import { buildRealMeeting, loadNamedTranscript } from "../ingest/realSource";
import { loadSeedMeeting } from "../ingest/seedSource";
import { agentQueue, type MemoryJob } from "../lib/queueManager";

// The ingest worker (D1): a process in the api-server codebase — NOT a 4th
// service — that drains the `memory` queue. One job = full ingest of one
// meeting. BullMQ retries the whole job on failure; ingestMeeting is idempotent,
// so retries are safe (no state machine).
//
// Run: tsx src/worker/memory.worker.ts   (or `pnpm worker` / `pnpm worker:dev`)

const CONCURRENCY = Number(process.env.MEMORY_WORKER_CONCURRENCY) || 2;

// Resolve a meetingId: the diarize worker's named-transcript in R2 (real
// speaker names), else the seed corpus (eval). R2 unconfigured = seed-only dev.
async function resolveMeeting(meetingId: string) {
  if (!systemConfig.R2_ENDPOINT) return loadSeedMeeting(meetingId);

  try {
    const { path, cleanup } = await getArtifactStore().resolve(
      `${meetingId}.named-transcript.jsonl`
    );
    try {
      const segments = loadNamedTranscript(path);
      const { meta } = buildRealMeeting(segments, meetingId);
      console.log(`[memory] resolved ${meetingId} from named-transcript (${segments.length} segs)`);
      return { segments, meta };
    } finally {
      await cleanup();
    }
  } catch (err) {
    if (err instanceof ArtifactNotFoundError) {
      console.log(`[memory] no named-transcript for ${meetingId} — falling back to seed`);
      return loadSeedMeeting(meetingId);
    }
    throw err;
  }
}

const worker = new Worker<MemoryJob>(
  "memory",
  async (job) => {
    const { meetingId, ownerId } = job.data;
    console.log(`[memory] ingest start: ${meetingId} (job ${job.id})`);

    const { eq } = await import("drizzle-orm");
    const { meetings } = await import("../db/schema");
    await db
      .update(meetings)
      .set({ status: "ingesting", statusError: null })
      .where(eq(meetings.id, meetingId));

    let result;
    try {
      const { segments, meta } = await resolveMeeting(meetingId);
      result = await ingestMeeting({ meetingId, segments, meta, ownerId: ownerId ?? null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(meetings)
        .set({ status: "failed", statusError: `ingest: ${msg}` })
        .where(eq(meetings.id, meetingId));
      throw err;
    }

    const { counts, dropped } = result;
    console.log(
      `[memory] ingest done:  ${meetingId} type=${result.meetingType} ` +
        `chunks=${counts.chunks} decisions=${counts.decisions} ` +
        `actions=${counts.actionItems} chapters=${counts.chapters} ` +
        `dropped=${dropped.decisions + dropped.actionItems}`
    );

    if (systemConfig.AGENT_AFTER_INGEST) {
      await agentQueue.add("propose", { meetingId }, { jobId: meetingId });
      console.log(`[memory] enqueued agent propose for ${meetingId}`);
    }
    return result;
  },
  {
    connection: { url: systemConfig.REDIS_URL },
    concurrency: CONCURRENCY,
  }
);

worker.on("failed", (job, err) => {
  console.error(`[memory] job ${job?.id} (${job?.data.meetingId}) failed:`, err.message);
});

console.log(`[memory] worker up, concurrency=${CONCURRENCY}, draining "memory" queue`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[memory] received ${signal}, closing worker...`);
  await worker.close();
  await pool.end();
  void db; // keep the client import tree-shake-safe; pool owns the connection
  console.log("[memory] worker closed.");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
