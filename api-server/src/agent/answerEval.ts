import { readFileSync } from "fs";
import path from "path";
import { pool } from "../db/client";
import { ask } from "./ask";
import { judgeFaithfulness, judgeRelevancy } from "./judge";

// End-to-end answer baseline over the golden set — runs each question through the
// real agentic /ask loop and scores:
//   - behavior  : cite-or-refuse, grounding, refusal correctness   (deterministic)
//   - fact      : do expected_facts show up (keyword proxy — conservative floor)
//   - semantic  : faithfulness (no hallucination vs retrieved context) + relevancy
//                 via an LLM-as-judge (judge.ts). This is the de-saturating signal.
//
//   tsx src/agent/answerEval.ts            # full (with judge)
//   tsx src/agent/answerEval.ts --fast     # skip the LLM judge (behavior + fact only)

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
  const useJudge = !process.argv.includes("--fast");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { questions: GoldenQ[] };

  let factSum = 0, factN = 0;
  let faithSum = 0, relSum = 0, judgeN = 0;
  let citeOrRefuseOk = 0, groundedOk = 0;
  let refusalCorrect = 0, refusalN = 0;

  console.log(`\nAnswer baseline over ${golden.questions.length} questions${useJudge ? " (with LLM judge)" : " (--fast)"}\n`);
  console.log("id                       facts  faith  rel   cite ground  notes");
  console.log("─".repeat(86));

  for (const q of golden.questions) {
    const r = await ask(q.question);
    const notes: string[] = [];

    const compliant = q.expect_refusal ? r.refused : r.citations.length > 0;
    if (compliant) citeOrRefuseOk++;
    if (r.grounded) groundedOk++;

    if (q.expect_refusal) {
      refusalN++;
      if (r.refused) refusalCorrect++;
      else notes.push("DID NOT REFUSE");
      console.log(`${q.id.padEnd(24)} ${"—".padStart(5)}  ${"—".padStart(5)}  ${"—".padStart(4)}  ${r.refused ? "✓" : "✗"}    ${r.grounded ? "✓" : "✗"}     ${notes.join("; ")}`);
      continue;
    }

    const covered = q.expected_facts.filter((f) => factCovered(r.answer, f)).length;
    const frac = q.expected_facts.length ? covered / q.expected_facts.length : 1;
    factSum += frac;
    factN++;

    if (q.must_not_say?.some((s) => r.answer.toLowerCase().includes(s.toLowerCase()))) {
      notes.push("SAID FORBIDDEN");
    }

    let faithStr = "  — ", relStr = " — ";
    if (useJudge) {
      const [faith, rel] = await Promise.all([
        judgeFaithfulness(r.answer, r.contexts),
        judgeRelevancy(q.question, r.answer),
      ]);
      faithSum += faith.score;
      relSum += rel;
      judgeN++;
      faithStr = faith.score.toFixed(2);
      relStr = rel.toFixed(2);
      if (faith.unsupported.length) notes.push(`${faith.unsupported.length} unsupported claim(s)`);
    }

    console.log(
      `${q.id.padEnd(24)} ${frac.toFixed(2)}   ${faithStr}   ${relStr}  ${r.citations.length > 0 ? "✓" : "✗"}    ${r.grounded ? "✓" : "✗"}     ${notes.join("; ")}`
    );
  }

  const n = golden.questions.length;
  console.log("─".repeat(86));
  let line =
    `MEAN  fact=${(factSum / factN).toFixed(3)}  ` +
    (useJudge ? `faithfulness=${(faithSum / judgeN).toFixed(3)}  relevancy=${(relSum / judgeN).toFixed(3)}  ` : "") +
    `cite-or-refuse=${(citeOrRefuseOk / n).toFixed(3)}  grounded=${(groundedOk / n).toFixed(3)}  ` +
    `refusal=${refusalN ? (refusalCorrect / refusalN).toFixed(3) : "n/a"}`;
  console.log(line + "\n");

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
