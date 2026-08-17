import { pool } from "../platform/db/client";
import { proposeActions } from "../domain/actions/propose";

async function main(): Promise<void> {
  const meetingId = process.argv[2];
  if (!meetingId) {
    console.error("usage: pnpm propose <meetingId>");
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
