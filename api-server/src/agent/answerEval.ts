import { readFileSync } from "fs";
import path from "path";
import { pool } from "../db/client";
import { ask } from "./ask";

// End-to-end answer baseline over the golden set — runs each question through the
// real agentic /ask loop and scores behavior we can check deterministically:
//   - fact coverage  : do the expected_facts show up in the answer (keyword proxy)
//   - cite-or-refuse : non-refusals carry ≥1 citation; refusals refuse
//   - grounding      : the loop's own grounded flag
//   - meeting recall : were the relevant meetings retrieved in-context
// This is the fast proxy; Ragas (run_eval.py) is the semantic judge for
// faithfulness / answer-relevancy. No Python needed to run this.
//
//   tsx src/agent/answerEval.ts

interface GoldenQ {
  id: string;
  type: string;
  question: string;
  expected_facts: string[];
  must_not_say?: string[];
  expect_refusal?: boolean;
  relevant_meetings: string[];
}

const GOLDEN = path.resolve(process.cwd(), "../eval/golden-set.json");

// A fact is "covered" if ≥60% of its content words (len>3 or numeric) appear in
// the answer. Crude keyword proxy — undercounts paraphrase; Ragas does semantic.
function factCovered(answer: string, fact: string): boolean {
  const a = answer.toLowerCase();
  const words = (fact.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length > 3 || /^[0-9]+$/.test(w)
  );
  if (!words.length) return a.includes(fact.toLowerCase());
  const hit = words.filter((w) => a.includes(w)).length;
  return hit / words.length >= 0.6;
}

async function main(): Promise<void> {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { questions: GoldenQ[] };

  let factSum = 0;
  let factN = 0;
  let citeOrRefuseOk = 0;
  let groundedOk = 0;
  let meetingRecallSum = 0;
  let meetingRecallN = 0;
  let refusalCorrect = 0;
  let refusalN = 0;

  console.log(`\nAnswer baseline over ${golden.questions.length} golden questions\n`);
  console.log("id                       facts  cite  ground  notes");
  console.log("─".repeat(80));

  for (const q of golden.questions) {
    const r = await ask(q.question);
    const notes: string[] = [];

    // cite-or-refuse compliance: refusal refuses, else ≥1 citation.
    const compliant = q.expect_refusal ? r.refused : r.citations.length > 0;
    if (compliant) citeOrRefuseOk++;
    if (r.grounded) groundedOk++;

    if (q.expect_refusal) {
      refusalN++;
      if (r.refused) refusalCorrect++;
      else notes.push("DID NOT REFUSE");
      console.log(
        `${q.id.padEnd(24)} ${"—".padStart(5)}  ${r.refused ? "✓" : "✗"}     ${r.grounded ? "✓" : "✗"}     ${notes.join("; ")}`
      );
      continue;
    }

    const covered = q.expected_facts.filter((f) => factCovered(r.answer, f)).length;
    const frac = q.expected_facts.length ? covered / q.expected_facts.length : 1;
    factSum += frac;
    factN++;

    // Exact substring (not the fuzzy keyword proxy) — a correct answer that says
    // "NOT localStorage" must not trip on the forbidden phrase's keywords.
    if (q.must_not_say?.some((s) => r.answer.toLowerCase().includes(s.toLowerCase()))) {
      notes.push("SAID FORBIDDEN");
    }

    if (q.relevant_meetings.length) {
      const found = q.relevant_meetings.filter((m) => r.retrievedMeetings.includes(m)).length;
      meetingRecallSum += found / q.relevant_meetings.length;
      meetingRecallN++;
    }

    console.log(
      `${q.id.padEnd(24)} ${frac.toFixed(2)}   ${r.citations.length > 0 ? "✓" : "✗"}     ${r.grounded ? "✓" : "✗"}     ${notes.join("; ")}`
    );
  }

  const n = golden.questions.length;
  console.log("─".repeat(80));
  console.log(
    `MEAN  fact-coverage=${(factSum / factN).toFixed(3)}  ` +
      `cite-or-refuse=${(citeOrRefuseOk / n).toFixed(3)}  ` +
      `grounded=${(groundedOk / n).toFixed(3)}  ` +
      `meeting-recall=${(meetingRecallSum / meetingRecallN).toFixed(3)}  ` +
      `refusal=${refusalN ? (refusalCorrect / refusalN).toFixed(3) : "n/a"}\n`
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
