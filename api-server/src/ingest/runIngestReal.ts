import { readFileSync } from "fs";
import path from "path";
import { pool } from "../db/client";
import type { TranscriptSegment } from "./chunker";
import { ingestMeeting } from "./ingestMeeting";
import type { MeetingMeta } from "./seedSource";

// Real-meeting ingest (the first real-data run, option b). Reads a batch
// named-transcript.jsonl produced by the v4 diarization merge — same shape as a
// seed ({speaker,text,start,end}) but with REAL speaker names already resolved —
// and feeds the identical ingestMeeting core the seeds + worker use. This is the
// "swap the transcript source" point the seedSource doc describes; the eventual
// R2 worker reader is a superset of this (fetch instead of readFileSync + a
// sidecar for title/participants/offset).
//
//   tsx src/ingest/runIngestReal.ts ../recordings/<id>.named-transcript.jsonl
//
// recordingOffsetS = 0 is CORRECT here, not a fudge: the batch transcript was run
// on the extracted recording audio, so its t=0 IS the recording t=0. The
// clock-skew problem only ever existed between the LIVE Deepgram stream and the
// recorder, which this path doesn't use.

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

// Derive the meetingId + UTC start from the artifact stem
// (<meetCode>_<YYYY-MM-DD>_<HH-MM-SS>, time is UTC).
function parseStem(file: string): { meetingId: string; startedAt: Date | null } {
  const meetingId = path
    .basename(file)
    .replace(/\.named-transcript\.jsonl$/, "")
    .replace(/\.transcript\.jsonl$/, "");
  const parts = meetingId.split("_");
  if (parts.length < 3) return { meetingId, startedAt: null };
  const [date, time] = [parts[parts.length - 2], parts[parts.length - 1]];
  const startedAt = new Date(`${date}T${time.replace(/-/g, ":")}Z`);
  return { meetingId, startedAt: isNaN(startedAt.getTime()) ? null : startedAt };
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const title = process.argv[3] ?? null; // optional human title override
  if (!file) {
    console.error(
      "usage: tsx src/ingest/runIngestReal.ts <named-transcript.jsonl> [title]"
    );
    process.exit(1);
  }

  const segments = loadSegments(file);
  if (segments.length === 0) throw new Error(`no segments in ${file}`);

  const { meetingId, startedAt } = parseStem(file);
  const durationS = Math.round(segments[segments.length - 1].end);
  const participants = [
    ...new Set(segments.map((s) => s.speaker).filter(Boolean)),
  ];
  const endedAt =
    startedAt && durationS != null
      ? new Date(startedAt.getTime() + durationS * 1000)
      : null;

  const meta: MeetingMeta = {
    title,
    startedAt,
    endedAt,
    durationS,
    participants,
    recordingUrl: `recordings/${meetingId}.webm`, // local-disk artifact (R2 later)
    recordingOffsetS: 0,
  };

  console.log(
    `ingesting REAL meeting ${meetingId}\n` +
      `  title=${meta.title}  participants=${participants.join(", ")}\n` +
      `  segments=${segments.length}  durationS=${durationS}  startedAt=${startedAt?.toISOString()}`
  );

  const r = await ingestMeeting({ meetingId, segments, meta });
  console.log(
    `✓ ${r.meetingId}  type=${r.meetingType}  ` +
      `chunks=${r.counts.chunks} decisions=${r.counts.decisions} ` +
      `actions=${r.counts.actionItems} chapters=${r.counts.chapters} ` +
      `(dropped ${r.dropped.decisions + r.dropped.actionItems})`
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
