import { memoryQueue } from "../platform/queues";
import { listSeedIds } from "../domain/ingest/seedSource";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ids = args.length === 1 && args[0] === "all" ? listSeedIds() : args;
  if (ids.length === 0) {
    console.error("usage: pnpm enqueue:seed <all | meetingId> [...]");
    process.exit(1);
  }

  for (const meetingId of ids) {
    const job = await memoryQueue.add("ingest", { meetingId }, { jobId: meetingId });
    console.log(`enqueued ${meetingId} (job ${job.id})`);
  }

  await memoryQueue.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
