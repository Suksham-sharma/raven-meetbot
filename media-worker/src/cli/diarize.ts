import dotenv from "dotenv";
import path from "path";
import { writeFileSync } from "fs";
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

import { diarizeRecording, serializeNamedTranscript } from "../diarize/pipeline";

async function main(): Promise<void> {
  const webm = process.argv[2];
  if (!webm) {
    console.error("usage: pnpm diarize <recording.webm> [out.jsonl]");
    process.exit(1);
  }
  const base = webm.replace(/\.webm$/, "");
  const speakersPath = `${base}.speakers.jsonl`;
  const outPath = process.argv[3] ?? `${base}.named-transcript.jsonl`;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set (repo-root .env)");

  const result = await diarizeRecording(webm, speakersPath, {
    apiKey,
    onLog: (m) => console.log(m),
  });

  console.log("\nspeaker map:");
  for (const a of result.assignments) {
    console.log(
      `  Speaker ${a.speaker} → ${a.name.padEnd(14)} ` +
        `[${a.method}, csrc=${a.csrcId ?? "—"}, conf=${(a.mappingConfidence * 100).toFixed(0)}%, ${a.utterances} utt]`
    );
  }

  writeFileSync(outPath, serializeNamedTranscript(result));
  console.log(`\n✓ wrote ${result.named.length} named utterances → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
