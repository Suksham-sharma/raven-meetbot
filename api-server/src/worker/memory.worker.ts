import { Worker } from "bullmq";
import systemConfig from "../config";
import { db, pool } from "../db/client";
import { ingestMeeting } from "../ingest/ingestMeeting";
import { loadSeedMeeting } from "../ingest/seedSource";
import type { MemoryJob } from "../lib/queueManager";

// The ingest worker (D1): a process in the api-server codebase — NOT a 4th
// service — that drains the `memory` queue. One job = full ingest of one
// meeting. BullMQ retries the whole job on failure; ingestMeeting is idempotent,
// so retries are safe (no state machine).
//
// Run: tsx src/worker/memory.worker.ts   (or `pnpm worker` / `pnpm worker:dev`)

const CONCURRENCY = Number(process.env.MEMORY_WORKER_CONCURRENCY) || 2;

// Resolve a meetingId to its transcript + meta. Dev/eval: the seed loader.
// Production swap point: fetch transcript.jsonl from R2 here.
async function resolveMeeting(meetingId: string) {
  return loadSeedMeeting(meetingId);
}

const worker = new Worker<MemoryJob>(
  "memory",
  async (job) => {
    const { meetingId } = job.data;
    console.log(`[memory] ingest start: ${meetingId} (job ${job.id})`);

    const { segments, meta } = await resolveMeeting(meetingId);
    const result = await ingestMeeting({ meetingId, segments, meta });

    const { counts, dropped } = result;
    console.log(
      `[memory] ingest done:  ${meetingId} type=${result.meetingType} ` +
        `chunks=${counts.chunks} decisions=${counts.decisions} ` +
        `actions=${counts.actionItems} chapters=${counts.chapters} ` +
        `dropped=${dropped.decisions + dropped.actionItems}`
    );
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
