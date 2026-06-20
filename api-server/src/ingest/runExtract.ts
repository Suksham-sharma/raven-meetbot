import { readFileSync } from "fs";
import { openaiProvider } from "../llm/openai";
import type { TranscriptSegment } from "./chunker";
import { extractMeeting } from "./extract";

// Manual harness: run extraction on a seed transcript and print the result.
//   tsx src/ingest/runExtract.ts ../eval/seeds/<file>.transcript.jsonl
async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: tsx src/ingest/runExtract.ts <transcript.jsonl>");
    process.exit(1);
  }

  const segments: TranscriptSegment[] = readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const o = JSON.parse(line);
      return { speaker: o.speaker, text: o.text, start: o.start, end: o.end };
    });

  const result = await extractMeeting(segments, openaiProvider);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
