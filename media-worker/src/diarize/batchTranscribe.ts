import { DeepgramClient } from "@deepgram/sdk";
import { createReadStream } from "fs";
import ffmpeg from "fluent-ffmpeg";
import type { DiarizedUtterance } from "./nameMerge";

// aresample=async=1 is load-bearing, not tuning. A MediaRecorder WebM has gaps
// wherever the browser stalled and raw PCM cannot represent one, so a plain
// extraction splices them out and every later utterance drifts early — 698.6s
// spliced vs 766.9s here, against a 766.9s mp4.
export function extractAudio(webmPath: string, outWavPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(webmPath)
      .noVideo()
      .audioFilters("aresample=async=1:first_pts=0")
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec("pcm_s16le")
      .on("error", reject)
      .on("end", () => resolve())
      .save(outWavPath);
  });
}

export interface TranscribeOptions {
  apiKey: string;
  keyterms?: string[];
  model?: string;
}

export async function transcribeBatch(
  audioPath: string,
  opts: TranscribeOptions
): Promise<DiarizedUtterance[]> {
  const client = new DeepgramClient({ apiKey: opts.apiKey });

  const res = await client.listen.v1.media.transcribeFile(
    createReadStream(audioPath),
    {
      model: opts.model ?? "nova-3",
      diarize: true,
      punctuate: true,
      utterances: true,
      smart_format: true,
      keyterm: opts.keyterms,
    }
  );

  if (!("results" in res)) {
    throw new Error(`Deepgram returned an async job (${res.request_id}), not a transcript`);
  }

  return (res.results?.utterances ?? []).map((u) => ({
    start: u.start ?? 0,
    end: u.end ?? 0,
    transcript: u.transcript ?? "",
    speaker: u.speaker ?? 0,
  }));
}
