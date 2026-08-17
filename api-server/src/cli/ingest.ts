import { pool } from "../platform/db/client";
import { ingestMeeting } from "../domain/ingest/ingestMeeting";
import { listSeedIds, loadSeedMeeting } from "../domain/ingest/seedSource";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "usage: pnpm ingest:seed <all | meetingId | file.jsonl> [...]"
    );
    process.exit(1);
  }

  const targets = args.length === 1 && args[0] === "all" ? listSeedIds() : args;

  for (const target of targets) {
    const { meetingId, segments, meta } = loadSeedMeeting(target);
    const r = await ingestMeeting({ meetingId, segments, meta });
    console.log(
      `✓ ${r.meetingId.padEnd(40)} type=${r.meetingType.padEnd(10)} ` +
        `chunks=${r.counts.chunks} decisions=${r.counts.decisions} ` +
        `actions=${r.counts.actionItems} chapters=${r.counts.chapters} ` +
        `(dropped ${r.dropped.decisions + r.dropped.actionItems})`
    );
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
