import { memoryQueue } from "../lib/queueManager";
import { listSeedIds } from "./seedSource";

// Enqueue seed meetings onto the `memory` queue to exercise the worker (the D1
// production path). The worker must be running to drain them.
//   tsx src/ingest/enqueueSeeds.ts all
//   tsx src/ingest/enqueueSeeds.ts <meetingId> [...more]
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ids = args.length === 1 && args[0] === "all" ? listSeedIds() : args;
  if (ids.length === 0) {
    console.error("usage: tsx src/ingest/enqueueSeeds.ts <all | meetingId> [...]");
    process.exit(1);
  }

  for (const meetingId of ids) {
    // jobId = meetingId: BullMQ dedupes, so re-enqueueing the same meeting while
    // one is queued won't pile up duplicates.
    const job = await memoryQueue.add("ingest", { meetingId }, { jobId: meetingId });
    console.log(`enqueued ${meetingId} (job ${job.id})`);
  }

  await memoryQueue.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
