import { readFileSync } from "fs";
import path from "path";
import { pool } from "../db/client";
import { hybridSearch } from "./hybridSearch";

// Retrieval-only baseline over the golden set: run each question through hybrid
// search and score whether the relevant MEETINGS surface in the top-k chunks
// (meeting-level recall@k / MRR / hit-rate). This is the "ruler" for the
// retrieval leg BEFORE the agentic /ask loop exists — chunk-level relevant_ids
// aren't labeled yet, so we score at meeting granularity. The Python run_eval.py
// scores answer quality (Ragas) once /ask lands; this complements it.
//
//   tsx src/search/retrievalEval.ts [--k 8]

interface GoldenQ {
  id: string;
  type: string;
  question: string;
  relevant_meetings: string[];
  expect_refusal?: boolean;
}

const GOLDEN = path.resolve(process.cwd(), "../eval/golden-set.json");

async function main(): Promise<void> {
  const kArg = process.argv.indexOf("--k");
  const k = kArg >= 0 ? Number(process.argv[kArg + 1]) : 8;

  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { questions: GoldenQ[] };
  const scored: GoldenQ[] = golden.questions.filter(
    (q) => !q.expect_refusal && q.relevant_meetings.length > 0
  );
  const refusals = golden.questions.filter((q) => q.expect_refusal);

  let recallSum = 0;
  let rrSum = 0;
  let hitCount = 0;

  console.log(`\nRetrieval baseline @k=${k}  (${scored.length} scored questions)\n`);
  console.log("id                       type                     recall  rr     top meeting");
  console.log("─".repeat(92));

  for (const q of scored) {
    const hits = await hybridSearch(q.question, { k });
    // Ordered, de-duplicated meetings by first appearance in the ranked hits.
    const ranked: string[] = [];
    for (const h of hits) if (!ranked.includes(h.meetingId)) ranked.push(h.meetingId);

    const relevant = new Set(q.relevant_meetings);
    const found = q.relevant_meetings.filter((m) => ranked.includes(m));
    const recall = found.length / q.relevant_meetings.length;

    const firstRelIdx = ranked.findIndex((m) => relevant.has(m));
    const rr = firstRelIdx >= 0 ? 1 / (firstRelIdx + 1) : 0;

    recallSum += recall;
    rrSum += rr;
    if (firstRelIdx >= 0) hitCount++;

    const flag = recall === 1 ? "" : recall === 0 ? "  ✗MISS" : "  ~partial";
    console.log(
      `${q.id.padEnd(24)} ${q.type.padEnd(24)} ${recall.toFixed(2)}    ${rr.toFixed(2)}   ${ranked[0] ?? "(none)"}${flag}`
    );
    if (recall < 1) {
      const missed = q.relevant_meetings.filter((m) => !ranked.includes(m));
      console.log(`${" ".repeat(24)} missed: ${missed.join(", ")}`);
    }
  }

  const n = scored.length;
  console.log("─".repeat(92));
  console.log(
    `MEAN  recall@${k}=${(recallSum / n).toFixed(3)}   MRR=${(rrSum / n).toFixed(3)}   ` +
      `hit-rate=${(hitCount / n).toFixed(3)}\n`
  );

  // Refusal questions: a healthy system retrieves WEAKLY here (low top score),
  // which the /ask cite-or-refuse guard turns into a refusal. Report for eyeballing.
  if (refusals.length) {
    console.log("Refusal probes (expect low top score / weak match):");
    for (const q of refusals) {
      const hits = await hybridSearch(q.question, { k: 3 });
      const top = hits[0];
      console.log(
        `  ${q.id.padEnd(20)} top=${top ? top.score.toFixed(4) : "none"} ` +
          `${top ? `(${top.meetingId})` : ""} — "${q.question}"`
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
