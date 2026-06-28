import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import type { DiarizedUtterance } from "./nameMerge";

// Deepgram batch (prerecorded) transcription + diarization. Batch — not live — is
// the v4 path: it runs on the finalized recording, so it can diarize the whole
// file at once and accept keyterms derived from the participant names (live can't —
// the WS keyterms are fixed at connect time, before any name is known).

// Extract audio-only, mono 16kHz PCM from the recording. The recording is already a
// mono composite mix (Meet SFU constraint), so downmixing loses nothing, and a small
// wav uploads far faster than the 100MB+ video webm.
export function extractAudio(webmPath: string, outWavPath: string): void {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", webmPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", outWavPath],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
}

interface DgUtterance {
  start: number;
  end: number;
  transcript: string;
  speaker?: number;
}
interface DgResponse {
  results?: { utterances?: DgUtterance[] };
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
  const params = new URLSearchParams({
    model: opts.model ?? "nova-3",
    diarize: "true",
    punctuate: "true",
    utterances: "true",
    smart_format: "true",
  });
  // nova-3 keyterm boosting — repeatable param, one per term.
  for (const k of opts.keyterms ?? []) params.append("keyterm", k);

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${opts.apiKey}`, "Content-Type": "audio/wav" },
    body: readFileSync(audioPath),
  });
  if (!res.ok) {
    throw new Error(`Deepgram batch failed ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as DgResponse;
  const utts = json.results?.utterances ?? [];
  return utts.map((u) => ({
    start: u.start,
    end: u.end,
    transcript: u.transcript,
    speaker: u.speaker ?? 0,
  }));
}
