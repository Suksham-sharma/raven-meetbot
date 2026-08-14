import { DeepgramClient } from "@deepgram/sdk";
import { createReadStream } from "fs";
import ffmpeg from "fluent-ffmpeg";
import type { DiarizedUtterance } from "./nameMerge";

// Batch, not live: it runs on the finalized recording, so it can diarize the
// whole file at once and take keyterms derived from participant names. Live
// can't — WS keyterms are fixed at connect time, before any name is known.

// The recording is already a mono composite mix (Meet SFU constraint), so
// downmixing loses nothing and a small wav uploads far faster than the video.
//
// aresample=async=1 is load-bearing, not tuning. A MediaRecorder WebM has gaps
// wherever the browser stalled, and raw PCM has nowhere to put a gap — so a
// plain extraction silently splices them out and every utterance after one
// lands early, drifting further with each gap. The transcript is what every
// citation timestamp is measured in, and the player is on the mp4's
// gap-preserving timeline, so the two have to agree. Measured on the reference
// recording: 698.6s spliced vs 766.9s here, against a 766.9s mp4.
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

  // The response is a union: passing a callback URL returns only a request_id
  // instead of a transcript. We never do, but the narrowing keeps that honest.
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
