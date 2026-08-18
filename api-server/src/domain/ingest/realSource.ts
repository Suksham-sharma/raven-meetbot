import { readFileSync } from "fs";
import path from "path";
import type { TranscriptSegment } from "./chunker";
import type { MeetingMeta } from "./seedSource";

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
  title: string | null = null,
  scheduledStart: Date | null = null
): RealMeeting {
  if (segments.length === 0) throw new Error(`no segments for ${idOrPath}`);

  const { meetingId, startedAt: parsedStart } = parseStem(idOrPath);
  const startedAt = scheduledStart ?? parsedStart;
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
    recordingUrl: `${meetingId}.webm`,
    recordingOffsetS: 0,
  };

  return { meetingId, segments, meta };
}
