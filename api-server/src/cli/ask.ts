import { ask } from "../domain/agent/ask";
import { pool } from "../platform/db/client";

async function main(): Promise<void> {
  const q = process.argv.slice(2).join(" ");
  if (!q) {
    console.error('usage: pnpm ask "<question>"');
    process.exit(1);
  }

  const r = await ask(q, null);
  console.log(`\nQ: ${q}\n`);
  console.log(`A: ${r.answer}\n`);
  console.log(
    `[grounded=${r.grounded} refused=${r.refused} iters=${r.iterations} ` +
      `tools=${r.toolCalls.map((t) => t.name).join(",") || "none"}]`
  );
  if (r.citations.length) {
    console.log("\ncitations:");
    for (const c of r.citations) {
      console.log(
        `  • ${c.meetingId} @${c.startS}s ${c.speaker ?? "?"}: ` +
          `${c.text.replace(/\s+/g, " ").slice(0, 90)}`
      );
    }
  }
  console.log();
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
