import { rmSync } from "fs";
import os from "os";
import path from "path";
import { extractAudio, transcribeBatch } from "./batchTranscribe";
import { mergeNames, type MergeResult } from "./nameMerge";
import { parseSpeakerTimeline } from "./speakerTimeline";

// v4 diarization core: recording + speaker timeline → real-name transcript.
// Shared by the CLI (runDiarize) and the BullMQ worker so there's one path.

export interface DiarizeOptions {
  apiKey: string;
  model?: string;
  onLog?: (msg: string) => void;
}

export async function diarizeRecording(
  webmPath: string,
  speakersPath: string,
  opts: DiarizeOptions
): Promise<MergeResult> {
  const log = opts.onLog ?? (() => {});

  const timeline = parseSpeakerTimeline(speakersPath);
  const keyterms = timeline.participants; // tile names → keyterms (NOT from ASR)
  log(
    `timeline: ${timeline.csrc.length} csrc samples, ` +
      `binds=[${[...timeline.binds.entries()].map(([id, n]) => `${id}→${n}`).join(", ")}], ` +
      `keyterms=[${keyterms.join(", ")}]`
  );

  const wav = path.join(os.tmpdir(), `${path.basename(webmPath, ".webm")}.diarize.wav`);
  log("extracting audio…");
  await extractAudio(webmPath, wav);

  try {
    log("transcribing (Deepgram batch nova-3, diarize + keyterms)…");
    const utterances = await transcribeBatch(wav, {
      apiKey: opts.apiKey,
      keyterms,
      model: opts.model,
    });
    log(
      `  ${utterances.length} utterances, ` +
        `${new Set(utterances.map((u) => u.speaker)).size} diarized speakers`
    );
    return mergeNames(utterances, timeline);
  } finally {
    rmSync(wav, { force: true });
  }
}

export function serializeNamedTranscript(result: MergeResult): string {
  return result.named.map((n) => JSON.stringify(n)).join("\n") + "\n";
}
