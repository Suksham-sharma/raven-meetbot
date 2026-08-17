import { readFileSync } from "fs";
import path from "path";
import { pool } from "../platform/db/client";
import { hybridSearch } from "../domain/search/hybridSearch";

interface GoldenQ {
  id: string;
  type: string;
  question: string;
  relevant_meetings: string[];
  relevant_ids: string[];
  expect_refusal?: boolean;
}

const GOLDEN = path.resolve(process.cwd(), "../eval/golden-set.json");

function recallAtK(retrieved: string[], relevant: string[], k: number): number {
  if (!relevant.length) return 1;
  const top = new Set(retrieved.slice(0, k));
  return relevant.filter((r) => top.has(r)).length / relevant.length;
}

function mrr(retrieved: string[], relevant: string[]): number {
  const rel = new Set(relevant);
  for (let i = 0; i < retrieved.length; i++) if (rel.has(retrieved[i])) return 1 / (i + 1);
  return 0;
}

function ndcgAtK(retrieved: string[], relevant: string[], k: number): number {
  const rel = new Set(relevant);
  let dcg = 0;
  retrieved.slice(0, k).forEach((id, i) => {
    if (rel.has(id)) dcg += 1 / Math.log2(i + 2);
  });
  const ideal = Math.min(rel.size, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
}

async function main(): Promise<void> {
  const kArg = process.argv.indexOf("--k");
  const k = kArg >= 0 ? Number(process.argv[kArg + 1]) : 8;

  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { questions: GoldenQ[] };
  const scored = golden.questions.filter((q) => !q.expect_refusal && q.relevant_ids.length > 0);
  const refusals = golden.questions.filter((q) => q.expect_refusal);

  let recallSum = 0;
  let mrrSum = 0;
  let ndcgSum = 0;
  let mtgRecallSum = 0;

  console.log(`\nChunk-level retrieval baseline @k=${k}  (${scored.length} scored questions)\n`);
  console.log("id                       type                   recall   mrr   ndcg   mtg   miss");
  console.log("─".repeat(92));

  for (const q of scored) {
    const hits = await hybridSearch(q.question, { k });
    const chunkKeys = hits.map((h) => `${h.meetingId}#${h.seq}`);
    const meetingKeys: string[] = [];
    for (const h of hits) if (!meetingKeys.includes(h.meetingId)) meetingKeys.push(h.meetingId);

    const recall = recallAtK(chunkKeys, q.relevant_ids, k);
    const rr = mrr(chunkKeys, q.relevant_ids);
    const ndcg = ndcgAtK(chunkKeys, q.relevant_ids, k);
    const mtgRecall = recallAtK(meetingKeys, q.relevant_meetings, k);

    recallSum += recall;
    mrrSum += rr;
    ndcgSum += ndcg;
    mtgRecallSum += mtgRecall;

    const missed = q.relevant_ids.filter((id) => !chunkKeys.slice(0, k).includes(id));
    console.log(
      `${q.id.padEnd(24)} ${q.type.padEnd(22)} ${recall.toFixed(2)}   ${rr.toFixed(2)}  ${ndcg.toFixed(2)}  ${mtgRecall.toFixed(2)}  ${missed.join(",")}`
    );
  }

  const n = scored.length;
  console.log("─".repeat(92));
  console.log(
    `MEAN  chunk recall@${k}=${(recallSum / n).toFixed(3)}  MRR=${(mrrSum / n).toFixed(3)}  ` +
      `nDCG@${k}=${(ndcgSum / n).toFixed(3)}   |   meeting recall@${k}=${(mtgRecallSum / n).toFixed(3)}\n`
  );

  if (refusals.length) {
    console.log("Refusal probes (expect weak top match):");
    for (const q of refusals) {
      const hits = await hybridSearch(q.question, { k: 3 });
      const top = hits[0];
      console.log(
        `  ${q.id.padEnd(20)} top=${top ? top.score.toFixed(4) : "none"} ${top ? `(${top.meetingId}#${top.seq})` : ""}`
      );
    }
    console.log();
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
