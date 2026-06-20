import { readFileSync, writeFileSync } from "fs";
import path from "path";
import OpenAI from "openai";
import systemConfig from "../config";

// Offline eval-seed transcript generator (DEV TOOL — not production code).
//
// We control the ground truth (planted facts per agenda section) and let a cheap
// model add realistic spoken volume + messiness around it, so golden questions
// stay honest while seeds get real length + distractors. Timestamps are assigned
// deterministically from word counts (~2.4 words/sec), NOT by the model, so they
// are monotonic and plausible.
//
//   tsx src/ingest/genTranscript.ts ../eval/specs/<spec>.json
//
// Spec shape:
//   { id, type, participants: [{name, role}], context, sections: [
//       { topic, mustInclude: string[], approxTurns?: number } ] }
// Output: ../eval/seeds/<id>.transcript.jsonl  (same shape Deepgram writes)

interface Roster {
  name: string;
  role: string;
}
interface Section {
  topic: string;
  mustInclude: string[];
  approxTurns?: number;
}
interface Spec {
  id: string;
  type: string;
  context: string;
  participants: Roster[];
  sections: Section[];
}

interface Turn {
  speaker: string;
  text: string;
}

const WORDS_PER_SEC = 2.4; // ~145 wpm conversational pace
const SECTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["turns"],
  properties: {
    turns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["speaker", "text"],
        properties: { speaker: { type: "string" }, text: { type: "string" } },
      },
    },
  },
} as const;

const client = new OpenAI({ apiKey: systemConfig.OPENAI_API_KEY });

async function generateSection(spec: Spec, section: Section): Promise<Turn[]> {
  const roster = spec.participants
    .map((p) => `${p.name} (${p.role})`)
    .join(", ");
  const n = section.approxTurns ?? 38;

  const system = `You write realistic, natural spoken-meeting dialogue for a transcript dataset. Output ONLY turns of dialogue.
- Speakers are EXACTLY these people, referred to by first name: ${roster}.
- Style: real spoken English — contractions, occasional filler ("um", "like", "you know"), brief false starts, people interrupting/agreeing. NOT polished prose. Vary turn length (some one-liners, some longer).
- Every fact in "must cover" MUST be stated clearly and unambiguously by someone (a listener should be able to answer a question about it from the words alone). Weave them in naturally; surround them with realistic back-and-forth.
- Do NOT invent decisions or commitments beyond the must-cover points and natural small talk. Stay on this section's topic.`;

  const user = `Meeting context: ${spec.context}
This section's topic: ${section.topic}
Must cover (state each clearly):
${section.mustInclude.map((f) => `- ${f}`).join("\n")}

Write about ${n} natural dialogue turns for THIS section only.`;

  const resp = await client.chat.completions.create({
    model: systemConfig.OPENAI_GEN_MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "dialogue", strict: true, schema: SECTIONS_SCHEMA },
    },
  });

  const content = resp.choices[0]?.message?.content;
  if (!content) throw new Error(`empty generation for section "${section.topic}"`);
  const parsed = JSON.parse(content) as { turns: Turn[] };
  const names = new Set(spec.participants.map((p) => p.name));
  // Keep only turns attributed to a known speaker; coerce stray names to the first.
  return parsed.turns
    .filter((t) => t.text && t.text.trim().length > 0)
    .map((t) => ({
      speaker: names.has(t.speaker) ? t.speaker : spec.participants[0].name,
      text: t.text.trim(),
    }));
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function timestamp(turns: Turn[]): string {
  let t = 2.0; // small lead-in before first word
  const lines = turns.map((turn) => {
    const words = wordCount(turn.text);
    const dur = Math.max(1.4, words / WORDS_PER_SEC);
    const start = Math.round(t * 10) / 10;
    const end = Math.round((t + dur) * 10) / 10;
    // ASR-like confidence spread, deterministic from length.
    const confidence = Math.round((0.82 + ((words * 7) % 13) / 100) * 100) / 100;
    t = end + 0.2 + ((words * 3) % 4) / 10; // 0.2–0.5s inter-turn gap
    return JSON.stringify({
      speaker: turn.speaker,
      text: turn.text,
      start,
      end,
      confidence,
    });
  });
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("usage: tsx src/ingest/genTranscript.ts <spec.json>");
    process.exit(1);
  }
  const spec: Spec = JSON.parse(readFileSync(specPath, "utf8"));
  const seedsDir =
    process.env.SEEDS_DIR || path.resolve(process.cwd(), "../eval/seeds");
  const outPath = path.join(seedsDir, `${spec.id}.transcript.jsonl`);

  console.log(`generating ${spec.id} (${spec.sections.length} sections, model ${systemConfig.OPENAI_GEN_MODEL})`);
  const allTurns: Turn[] = [];
  for (const section of spec.sections) {
    const turns = await generateSection(spec, section);
    console.log(`  • ${section.topic} → ${turns.length} turns`);
    allTurns.push(...turns);
  }

  const jsonl = timestamp(allTurns);
  writeFileSync(outPath, jsonl);
  const lastEnd = JSON.parse(jsonl.trim().split("\n").pop()!).end as number;
  console.log(
    `✓ wrote ${outPath} — ${allTurns.length} turns, ~${Math.round(lastEnd / 60)} min`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
