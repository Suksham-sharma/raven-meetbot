import { pool } from "../db/client";
import { hybridSearch } from "./hybridSearch";

// Ad-hoc hybrid search probe.
//   tsx src/search/runSearch.ts "what rate limit on login and why"
//   tsx src/search/runSearch.ts "Otter transcripts" --k 5 --type sales
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // Parse --flag value pairs out; everything else is the query.
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
    console.error('usage: tsx src/search/runSearch.ts "<query>" [--k N] [--type sales] [--meeting <id>]');
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
