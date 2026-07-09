import { pool } from "../db/client";
import { proposeActions } from "./propose";

// Manual proposer probe: tsx src/actions/runPropose.ts <meetingId>

async function main(): Promise<void> {
  const meetingId = process.argv[2];
  if (!meetingId) {
    console.error("usage: tsx src/actions/runPropose.ts <meetingId>");
    process.exit(1);
  }
  const r = await proposeActions(meetingId);
  console.log(
    `✓ ${r.meetingId}: proposed=${r.proposed} ` +
      `skipped(unsourced=${r.skipped.unsourced} invalid=${r.skipped.invalid} dup=${r.skipped.duplicate})`
  );
  for (const t of r.titles) console.log(`  - ${t}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
