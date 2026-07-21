import { ask } from "./ask";
import { pool } from "../db/client";

// Ad-hoc probe for the agentic /ask loop (no HTTP server needed).
//   tsx src/agent/runAsk.ts "what did we decide about refresh tokens?"
async function main(): Promise<void> {
  const q = process.argv.slice(2).join(" ");
  if (!q) {
    console.error('usage: tsx src/agent/runAsk.ts "<question>"');
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
