import { rmSync } from "fs";
import os from "os";
import path from "path";
import { extractAudio, transcribeBatch } from "./batchTranscribe";
import { bindFromChurn } from "./churnBind";
import { mergeNames, type MergeResult } from "./nameMerge";
import { parseSpeakerTimeline } from "./speakerTimeline";

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
  const keyterms = timeline.participants;
  log(
    `timeline: ${timeline.csrc.length} csrc samples, ${timeline.churn.length} churn intervals, ` +
      `binds=[${[...timeline.binds.entries()].map(([id, n]) => `${id}→${n}`).join(", ")}], ` +
      `keyterms=[${keyterms.join(", ")}]`
  );
  const churnBinds = bindFromChurn(timeline);
  timeline.churnBinds = new Map(churnBinds.map((b) => [b.csrcId, b.name]));
  for (const b of churnBinds) {
    log(`churn bind: ${b.csrcId}→${b.name} (phi=${b.phi}, runner-up ${b.runnerUpPhi}, ${b.hotTicks} hot ticks)`);
  }

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

export async function diarizeWithoutTimeline(
  webmPath: string,
  opts: DiarizeOptions
): Promise<MergeResult> {
  const log = opts.onLog ?? (() => {});
  const wav = path.join(os.tmpdir(), `${path.basename(webmPath, ".webm")}.diarize.wav`);
  log("extracting audio…");
  await extractAudio(webmPath, wav);
  try {
    log("transcribing (Deepgram batch nova-3, diarize without timeline)…");
    const utterances = await transcribeBatch(wav, {
      apiKey: opts.apiKey,
      model: opts.model,
    });
    log(`  ${utterances.length} utterances, ${new Set(utterances.map((u) => u.speaker)).size} diarized speakers`);
    const named = utterances.map((u) => ({
      speaker: `Speaker ${u.speaker}`,
      start: u.start,
      end: u.end,
      text: u.transcript,
      confidence: 1,
    }));
    const assignments = [...new Set(utterances.map((u) => u.speaker))].map((speaker) => ({
      speaker,
      csrcId: null,
      name: `Speaker ${speaker}`,
      method: "unresolved" as const,
      mappingConfidence: 0,
      utterances: utterances.filter((u) => u.speaker === speaker).length,
    }));
    return { named, assignments };
  } finally {
    rmSync(wav, { force: true });
  }
}

export function serializeNamedTranscript(result: MergeResult): string {
  return result.named.map((n) => JSON.stringify(n)).join("\n") + "\n";
}
