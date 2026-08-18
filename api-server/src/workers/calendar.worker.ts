import { Worker } from "bullmq";
import { syncAllCalendarAccounts } from "../domain/calendar/reconcile";
import systemConfig from "../platform/config";
import { pool } from "../platform/db/client";
import { calendarQueue } from "../platform/queues";

const connection = { url: systemConfig.REDIS_URL };

const worker = new Worker(
  "calendar-sync",
  async () => syncAllCalendarAccounts(),
  { connection, concurrency: 1 }
);

worker.on("failed", (job, error) => {
  console.error(`[calendar] job ${job?.id} failed:`, error.message);
});

async function shutdown(): Promise<void> {
  await worker.close();
  await calendarQueue.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

async function start(): Promise<void> {
  await calendarQueue.upsertJobScheduler(
    "calendar-sync",
    { every: systemConfig.CALENDAR_SYNC_INTERVAL_MS },
    { name: "sync-all", data: {} }
  );
}

void start().catch((error) => {
  console.error("[calendar] failed to start:", error);
  process.exit(1);
});
