import { pool } from "../db/client";
import { ingestMeeting } from "./ingestMeeting";
import { buildRealMeeting, loadNamedTranscript } from "./realSource";

// Manual/backfill ingest of a v4 named-transcript.jsonl file. The memory worker
// runs the same buildRealMeeting path against R2 artifacts.
//
//   tsx src/ingest/runIngestReal.ts <id>.named-transcript.jsonl [title]

async function main(): Promise<void> {
  const file = process.argv[2];
  const title = process.argv[3] ?? null; // optional human title override
  if (!file) {
    console.error(
      "usage: tsx src/ingest/runIngestReal.ts <named-transcript.jsonl> [title]"
    );
    process.exit(1);
  }

  const segments = loadNamedTranscript(file);
  const { meetingId, meta } = buildRealMeeting(segments, file, title);

  console.log(
    `ingesting REAL meeting ${meetingId}\n` +
      `  title=${meta.title}  participants=${meta.participants.join(", ")}\n` +
      `  segments=${segments.length}  durationS=${meta.durationS}  ` +
      `startedAt=${meta.startedAt?.toISOString()}`
  );

  const r = await ingestMeeting({ meetingId, segments, meta });
  console.log(
    `✓ ${r.meetingId}  type=${r.meetingType}  ` +
      `chunks=${r.counts.chunks} decisions=${r.counts.decisions} ` +
      `actions=${r.counts.actionItems} chapters=${r.counts.chapters} ` +
      `(dropped ${r.dropped.decisions + r.dropped.actionItems})`
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
