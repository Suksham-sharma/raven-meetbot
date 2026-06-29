import { readFileSync } from "fs";
import path from "path";
import type { TranscriptSegment } from "./chunker";
import type { MeetingMeta } from "./seedSource";

// Real-meeting ingest source: turns a v4 named-transcript (real speaker names
// from the diarization merge) into the { meetingId, segments, meta } shape
// ingestMeeting consumes. Shared by the memory worker and the runIngestReal CLI.
//
// recordingOffsetS = 0 is correct, not a fudge: the batch transcript ran on the
// recording audio itself, so its t=0 IS recording t=0.

export function loadNamedTranscript(file: string): TranscriptSegment[] {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const o = JSON.parse(line);
      return { speaker: o.speaker, text: o.text, start: o.start, end: o.end };
    });
}

// meetingId + UTC start from the artifact stem (<meetCode>_<YYYY-MM-DD>_<HH-MM-SS>).
export function parseStem(fileOrId: string): {
  meetingId: string;
  startedAt: Date | null;
} {
  const meetingId = path
    .basename(fileOrId)
    .replace(/\.named-transcript\.jsonl$/, "")
    .replace(/\.transcript\.jsonl$/, "");
  const parts = meetingId.split("_");
  if (parts.length < 3) return { meetingId, startedAt: null };
  const [date, time] = [parts[parts.length - 2], parts[parts.length - 1]];
  const startedAt = new Date(`${date}T${time.replace(/-/g, ":")}Z`);
  return { meetingId, startedAt: isNaN(startedAt.getTime()) ? null : startedAt };
}

export interface RealMeeting {
  meetingId: string;
  segments: TranscriptSegment[];
  meta: MeetingMeta;
}

export function buildRealMeeting(
  segments: TranscriptSegment[],
  idOrPath: string,
  title: string | null = null
): RealMeeting {
  if (segments.length === 0) throw new Error(`no segments for ${idOrPath}`);

  const { meetingId, startedAt } = parseStem(idOrPath);
  const durationS = Math.round(segments[segments.length - 1].end);
  const participants = [
    ...new Set(segments.map((s) => s.speaker).filter(Boolean)),
  ];
  const endedAt = startedAt
    ? new Date(startedAt.getTime() + durationS * 1000)
    : null;

  const meta: MeetingMeta = {
    title,
    startedAt,
    endedAt,
    durationS,
    participants,
    recordingUrl: `${meetingId}.webm`, // R2 key
    recordingOffsetS: 0,
  };

  return { meetingId, segments, meta };
}
