import dotenv from "dotenv";
import path from "path";
import { rmSync, writeFileSync } from "fs";
import os from "os";
// DEEPGRAM_API_KEY lives in the repo-root .env (the bot's env); api-server/.env only
// has the OpenAI key. Load both — dotenv won't clobber already-set vars.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

import { parseSpeakerTimeline } from "./speakerTimeline";
import { extractAudio, transcribeBatch } from "./batchTranscribe";
import { mergeNames } from "./nameMerge";

// Standalone v4 batch worker (CLI form): a finalized recording + its speaker
// timeline → a real-name diarized transcript. Reproduces deterministically what was
// first proven ad-hoc. The eventual BullMQ form fetches from R2 and enqueues the
// result for memory ingest; the core (parse → keyterm transcribe → name-merge) is
// identical.
//
//   tsx src/diarize/runDiarize.ts ../recordings/<id>.webm [out.jsonl]

async function main(): Promise<void> {
  const webm = process.argv[2];
  if (!webm) {
    console.error("usage: tsx src/diarize/runDiarize.ts <recording.webm> [out.jsonl]");
    process.exit(1);
  }
  const base = webm.replace(/\.webm$/, "");
  const speakersPath = `${base}.speakers.jsonl`;
  const outPath = process.argv[3] ?? `${base}.named-transcript.jsonl`;

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set (repo-root .env)");

  const timeline = parseSpeakerTimeline(speakersPath);
  const keyterms = timeline.participants; // tile names → name keyterms (NOT from ASR)
  console.log(
    `timeline: ${timeline.csrc.length} csrc samples, ` +
      `binds=[${[...timeline.binds.entries()].map(([id, n]) => `${id}→${n}`).join(", ")}]`
  );
  console.log(`participants/keyterms: ${keyterms.join(", ")}`);

  const wav = path.join(os.tmpdir(), `${path.basename(base)}.diarize.wav`);
  console.log("extracting audio…");
  extractAudio(webm, wav);

  console.log("transcribing (Deepgram batch nova-3, diarize + keyterms)…");
  const utterances = await transcribeBatch(wav, { apiKey, keyterms });
  rmSync(wav, { force: true });
  console.log(`  ${utterances.length} utterances, ${new Set(utterances.map((u) => u.speaker)).size} diarized speakers`);

  const { named, assignments } = mergeNames(utterances, timeline);

  console.log("\nspeaker map:");
  for (const a of assignments) {
    console.log(
      `  Speaker ${a.speaker} → ${a.name.padEnd(14)} ` +
        `[${a.method}, csrc=${a.csrcId ?? "—"}, conf=${(a.mappingConfidence * 100).toFixed(0)}%, ${a.utterances} utt]`
    );
  }

  writeFileSync(outPath, named.map((n) => JSON.stringify(n)).join("\n") + "\n");
  console.log(`\n✓ wrote ${named.length} named utterances → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
