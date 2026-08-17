import { Worker } from "bullmq";
import systemConfig from "../platform/config/index";
import { pool } from "../platform/db/client";
import { proposeActions } from "../domain/actions/propose";
import type { AgentJob } from "../platform/queues";

const CONCURRENCY = Number(process.env.AGENT_WORKER_CONCURRENCY) || 2;

const worker = new Worker<AgentJob>(
  "agent",
  async (job) => {
    const { meetingId } = job.data;
    console.log(`[agent] propose start: ${meetingId} (job ${job.id})`);
    const r = await proposeActions(meetingId);
    console.log(
      `[agent] propose done:  ${meetingId} proposed=${r.proposed} ` +
        `skipped(unsourced=${r.skipped.unsourced} invalid=${r.skipped.invalid} dup=${r.skipped.duplicate})` +
        (r.titles.length ? ` — ${r.titles.join(" | ")}` : "")
    );
    return r;
  },
  {
    connection: { url: systemConfig.REDIS_URL },
    concurrency: CONCURRENCY,
  }
);

worker.on("failed", (job, err) => {
  console.error(`[agent] job ${job?.id} (${job?.data.meetingId}) failed:`, err.message);
});

console.log(`[agent] worker up, concurrency=${CONCURRENCY}, draining "agent" queue`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[agent] received ${signal}, closing worker...`);
  await worker.close();
  await pool.end();
  console.log("[agent] worker closed.");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
