import { readFileSync } from "fs";
import path from "path";
import { db, pool } from "../platform/db/client";
import { chunks } from "../platform/db/schema";
import { ask } from "../domain/agent/ask";

interface GoldenQ {
  id: string;
  type: string;
  question: string;
  expected_facts: string[];
  forbidden_in_evidence?: string[];
  relevant_ids: string[];
  relevant_meetings: string[];
  expect_refusal?: boolean;
}

const GOLDEN = path.resolve(process.cwd(), "../eval/golden-set.json");
const EPS = 5;

interface Span {
  startS: number;
  endS: number;
}

function covers(evStart: number, evEnd: number | null, span: Span): boolean {
  const b1 = evEnd ?? evStart;
  return evStart <= span.endS + EPS && b1 >= span.startS - EPS;
}

function factInText(text: string, fact: string): boolean {
  const a = text.toLowerCase();
  const words = (fact.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length > 3 || /^[0-9]+$/.test(w)
  );
  if (!words.length) return a.includes(fact.toLowerCase());
  return words.filter((w) => a.includes(w)).length / words.length >= 0.6;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

interface QAgg {
  recall: number[];
  precision: number[];
  forbidden: number[];
  irrelevant: number[];
  chunkCov: number[];
  toolCalls: number[];
  latencyMs: number[];
  usedStructured: number;
  usedTranscript: number;
}

async function main(): Promise<void> {
  const runsArg = process.argv.indexOf("--runs");
  const runs = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 1;

  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { questions: GoldenQ[] };
  const scored = golden.questions.filter((q) => !q.expect_refusal && q.relevant_ids.length > 0);

  const spans = new Map<string, Span>();
  const rows = await db
    .select({ meetingId: chunks.meetingId, seq: chunks.seq, startS: chunks.startS, endS: chunks.endS })
    .from(chunks);
  for (const r of rows) spans.set(`${r.meetingId}#${r.seq}`, { startS: r.startS, endS: r.endS });

  console.log(
    `\nAgent-path evidence eval  (${scored.length} scored questions${runs > 1 ? `, ${runs} runs` : ""})\n`
  );
  console.log("id                       type                    recall±std   prec  cont  irr  tools  calls  ms");
  console.log("─".repeat(110));

  const agg = new Map<string, QAgg>();

  for (const q of scored) {
    const labeled = q.relevant_ids
      .map((rid) => ({ meetingId: rid.slice(0, rid.lastIndexOf("#")), span: spans.get(rid) }))
      .filter((x): x is { meetingId: string; span: Span } => Boolean(x.span));
    const relevantSet = new Set(q.relevant_meetings);

    const a: QAgg = {
      recall: [], precision: [], forbidden: [], irrelevant: [], chunkCov: [],
      toolCalls: [], latencyMs: [], usedStructured: 0, usedTranscript: 0,
    };

    for (let run = 0; run < runs; run++) {
      const t0 = Date.now();
      const r = await ask(q.question, null);
      a.latencyMs.push(Date.now() - t0);
      a.toolCalls.push(r.toolCalls.length);
      if (r.toolCalls.some((t) => t.name === "search_structured")) a.usedStructured++;
      if (r.toolCalls.some((t) => t.name === "search_transcript")) a.usedTranscript++;

      const evidenceText = r.contexts
        .map((c) => c.replace(/^\[meeting[^\]]*\]\s*/, ""))
        .join("\n")
        .toLowerCase();

      const factHit = q.expected_facts.filter((f) => factInText(evidenceText, f)).length;
      a.recall.push(q.expected_facts.length ? factHit / q.expected_facts.length : 1);

      a.forbidden.push(
        q.forbidden_in_evidence?.some((f) => factInText(evidenceText, f)) ? 1 : 0
      );

      const evMeetings = r.evidence.map((e) => e.meetingId);
      const relItems = evMeetings.filter((m) => relevantSet.has(m)).length;
      a.precision.push(evMeetings.length ? relItems / evMeetings.length : 1);
      a.irrelevant.push(new Set(evMeetings.filter((m) => !relevantSet.has(m))).size);

      const evidence = r.evidence ?? [];
      let covered = 0;
      for (const { meetingId, span } of labeled) {
        if (evidence.some((e) => e.meetingId === meetingId && covers(e.startS, e.endS, span))) covered++;
      }
      a.chunkCov.push(labeled.length ? covered / labeled.length : 1);
    }

    agg.set(q.id, a);
    const recallMean = mean(a.recall);
    const tools = `${a.usedStructured ? "S" : "-"}${a.usedTranscript ? "T" : "-"}`;
    console.log(
      `${q.id.padEnd(24)} ${q.type.padEnd(23)} ${recallMean.toFixed(2)}±${std(a.recall).toFixed(2)}  ` +
        `${mean(a.precision).toFixed(2)}  ${mean(a.forbidden).toFixed(2)}  ${mean(a.irrelevant).toFixed(1)}  ` +
        `${tools.padEnd(5)}  ${mean(a.toolCalls).toFixed(1)}   ${Math.round(mean(a.latencyMs))}`
    );
  }

  const all = [...agg.values()];
  const recallByType = new Map<string, number[]>();
  for (const q of scored) recallByType.set(q.type, [...(recallByType.get(q.type) ?? []), mean(agg.get(q.id)!.recall)]);

  const contamQs = scored.filter((q) => q.forbidden_in_evidence?.length);
  const contamRate = mean(contamQs.map((q) => mean(agg.get(q.id)!.forbidden)));

  console.log("─".repeat(110));
  console.log(
    `MEAN  context_fact_recall = ${mean(all.map((a) => mean(a.recall))).toFixed(3)}` +
      ` (avg per-question std ${mean(all.map((a) => std(a.recall))).toFixed(3)})  |  ` +
      `relevant-meeting precision = ${mean(all.map((a) => mean(a.precision))).toFixed(3)}  |  ` +
      `irrelevant meetings/q = ${mean(all.map((a) => mean(a.irrelevant))).toFixed(2)}`
  );
  console.log(
    `      contamination rate = ${contamRate.toFixed(3)} (over ${contamQs.length} forbidden-fact qs: ${contamQs.map((q) => q.id.split("-")[0]).join(",")})  |  ` +
      `chunk_cov = ${mean(all.map((a) => mean(a.chunkCov))).toFixed(3)} (diagnostic)`
  );
  console.log(
    `      mean tool calls/q = ${mean(all.map((a) => mean(a.toolCalls))).toFixed(2)}  |  ` +
      `mean latency = ${Math.round(mean(all.map((a) => mean(a.latencyMs))))} ms`
  );
  console.log("\ncontext_fact_recall by query type:");
  for (const [type, xs] of [...recallByType.entries()].sort()) {
    console.log(`  ${type.padEnd(24)} ${mean(xs).toFixed(3)}  (${xs.length})`);
  }
  console.log();

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
