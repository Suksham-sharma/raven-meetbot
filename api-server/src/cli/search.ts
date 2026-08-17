import { pool } from "../platform/db/client";
import { hybridSearch } from "../domain/search/hybridSearch";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const queryWords: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      flags[args[i].slice(2)] = args[++i];
    } else {
      queryWords.push(args[i]);
    }
  }
  const query = queryWords.join(" ");
  if (!query) {
    console.error('usage: pnpm search "<query>" [--k N] [--type sales] [--meeting <id>]');
    process.exit(1);
  }
  const k = flags.k ? Number(flags.k) : 8;

  const hits = await hybridSearch(query, {
    k,
    filters: { meetingType: flags.type, meetingId: flags.meeting },
  });

  console.log(`\nquery: "${query}"  (k=${k})\n`);
  hits.forEach((h, i) => {
    const legs = `vec=${h.vecRank ?? "-"} fts=${h.ftsRank ?? "-"}`;
    console.log(
      `${String(i + 1).padStart(2)}. [${h.score.toFixed(4)}] ${legs.padEnd(16)} ` +
        `${h.meetingId} @${h.startS}s ${h.speaker ?? "?"}`
    );
    console.log(`    ${h.text.replace(/\s+/g, " ").slice(0, 130)}`);
  });
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
