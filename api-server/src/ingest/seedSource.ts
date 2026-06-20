import { readFileSync, readdirSync } from "fs";
import path from "path";
import type { TranscriptSegment } from "./chunker";

// Dev/eval transcript source. In production the ingest worker fetches
// transcript.jsonl from R2 by meetingId (the orchestrator already writes it
// there); for the eval seeds we read the same JSONL shape from disk. Both
// resolve to { meetingId, segments, meta } and feed the identical ingest core,
// so swapping R2 in later is one function, not a pipeline rewrite.
//
// Seed filename encodes the meeting: <slug>_<YYYY-MM-DD>_<HH-MM-SS>.transcript.jsonl
// The stem (everything before .transcript.jsonl) IS the meetingId — it's what the
// golden set's `relevant_meetings` references, so ingested rows line up with eval.

const SEEDS_DIR =
  process.env.SEEDS_DIR || path.resolve(process.cwd(), "../eval/seeds");

export interface MeetingMeta {
  title: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationS: number | null;
  participants: string[];
  recordingUrl: string | null;
  recordingOffsetS: number;
}

export interface SeedMeeting {
  meetingId: string;
  segments: TranscriptSegment[];
  meta: MeetingMeta;
}

function parseStem(stem: string): { title: string | null; startedAt: Date | null } {
  // <slug>_<date>_<time> — slug uses hyphens, the two trailing parts are date/time.
  const parts = stem.split("_");
  if (parts.length < 3) return { title: stem, startedAt: null };
  const [, date, time] = [parts[0], parts[parts.length - 2], parts[parts.length - 1]];
  const slug = parts.slice(0, parts.length - 2).join("_");
  const iso = `${date}T${time.replace(/-/g, ":")}Z`;
  const startedAt = new Date(iso);
  return {
    title: slug.replace(/-/g, " "),
    startedAt: isNaN(startedAt.getTime()) ? null : startedAt,
  };
}

function loadSegments(file: string): TranscriptSegment[] {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const o = JSON.parse(line);
      return { speaker: o.speaker, text: o.text, start: o.start, end: o.end };
    });
}

export function resolveSeedPath(meetingId: string): string {
  return path.join(SEEDS_DIR, `${meetingId}.transcript.jsonl`);
}

// Load one seed meeting (by id or by direct file path) into the ingest shape.
export function loadSeedMeeting(idOrPath: string): SeedMeeting {
  const file = idOrPath.endsWith(".jsonl")
    ? idOrPath
    : resolveSeedPath(idOrPath);
  const meetingId = path.basename(file).replace(/\.transcript\.jsonl$/, "");

  const segments = loadSegments(file);
  const { title, startedAt } = parseStem(meetingId);
  const durationS = segments.length
    ? Math.round(segments[segments.length - 1].end)
    : null;
  const participants = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
  const endedAt =
    startedAt && durationS != null
      ? new Date(startedAt.getTime() + durationS * 1000)
      : null;

  return {
    meetingId,
    segments,
    meta: {
      title,
      startedAt,
      endedAt,
      durationS,
      participants,
      recordingUrl: null, // synthetic seed: no recording
      recordingOffsetS: 0, // transcript and "recording" share t=0 by construction
    },
  };
}

// All seed meetingIds available on disk.
export function listSeedIds(): string[] {
  return readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith(".transcript.jsonl"))
    .map((f) => f.replace(/\.transcript\.jsonl$/, ""))
    .sort();
}
