import { Worker } from "bullmq";
import systemConfig from "../platform/config/index";
import { assertConfig } from "../platform/config/validate";
import { db, pool } from "../platform/db/client";
import { ArtifactNotFoundError, getArtifactStore } from "../platform/artifacts";
import { ingestMeeting } from "../domain/ingest/ingestMeeting";
import { buildRealMeeting, loadNamedTranscript } from "../domain/ingest/realSource";
import { loadSeedMeeting } from "../domain/ingest/seedSource";
import { agentQueue, type MemoryJob } from "../platform/queues";

assertConfig();

const CONCURRENCY = Number(process.env.MEMORY_WORKER_CONCURRENCY) || 2;

async function resolveMeeting(
  meetingId: string,
  title?: string | null,
  scheduledStartMs?: number | null
) {
  try {
    const { path, cleanup } = await getArtifactStore().resolve(
      `${meetingId}.named-transcript.jsonl`
    );
    try {
      const segments = loadNamedTranscript(path);
      const { meta } = buildRealMeeting(
        segments,
        meetingId,
        title,
        scheduledStartMs ? new Date(scheduledStartMs) : null
      );
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
    const { meetingId, ownerId, title, scheduledStartMs } = job.data;
    console.log(`[memory] ingest start: ${meetingId} (job ${job.id})`);

    const { eq } = await import("drizzle-orm");
    const { meetings } = await import("../platform/db/schema");
    await db
      .update(meetings)
      .set({ status: "ingesting", statusError: null })
      .where(eq(meetings.id, meetingId));

    let result;
    try {
      const { segments, meta } = await resolveMeeting(
        meetingId,
        title,
        scheduledStartMs
      );
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
  void db;
  console.log("[memory] worker closed.");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
