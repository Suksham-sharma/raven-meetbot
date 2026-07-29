import { Request, Response } from "express";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import systemConfig from "../config";
import { db } from "../db/client";
import { actionItems, chapters, decisions, meetings } from "../db/schema";
import {
  ArtifactNotFoundError,
  getArtifactStore,
} from "../diarize/artifactStore";
import { loadNamedTranscript } from "../ingest/realSource";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function requireUserId(req: Request): string {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}

async function requireOwnedMeeting(meetingId: string, userId: string) {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.ownerId, userId)));
  if (!meeting) throw new NotFoundError(`meeting ${meetingId} not found`);
  return meeting;
}

function parseLimit(raw: unknown): number {
  if (raw == null) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestError("limit must be a positive integer");
  }
  return Math.min(n, MAX_LIMIT);
}

function parseBefore(raw: unknown): Date | null {
  if (raw == null) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestError("before must be an ISO timestamp");
  }
  return d;
}

function summarize(m: typeof meetings.$inferSelect) {
  return {
    id: m.id,
    title: m.title,
    type: m.type,
    started_at: m.startedAt?.toISOString() ?? null,
    ended_at: m.endedAt?.toISOString() ?? null,
    duration_s: m.durationS,
    participants: (m.participants as string[] | null) ?? [],
    status: m.status,
    has_recording: m.recordingUrl != null,
  };
}

// GET /api/v1/meetings?limit=&before=
export const listMeetings = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const limit = parseLimit(req.query.limit);
  const before = parseBefore(req.query.before);

  const conds = [eq(meetings.ownerId, userId)];
  if (before) conds.push(lt(meetings.startedAt, before));

  const rows = await db
    .select()
    .from(meetings)
    .where(and(...conds))
    .orderBy(desc(meetings.startedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  res.status(200).json({
    meetings: page.map(summarize),
    next_before: hasMore ? (last?.startedAt?.toISOString() ?? null) : null,
  });
});

export const getMeeting = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  const meeting = await requireOwnedMeeting(meetingId, userId);

  const [chs, decs, items] = await Promise.all([
    db
      .select()
      .from(chapters)
      .where(eq(chapters.meetingId, meetingId))
      .orderBy(asc(chapters.seq)),
    db
      .select()
      .from(decisions)
      .where(eq(decisions.meetingId, meetingId))
      .orderBy(asc(decisions.seq)),
    db
      .select()
      .from(actionItems)
      .where(eq(actionItems.meetingId, meetingId))
      .orderBy(asc(actionItems.seq)),
  ]);

  res.status(200).json({
    ...summarize(meeting),
    summary: meeting.summary,
    recording_offset_s: meeting.recordingOffsetS,
    chapters: chs.map((c) => ({
      seq: c.seq,
      title: c.title,
      gist: c.gist,
      start_s: c.startS,
      end_s: c.endS,
    })),
    decisions: decs.map((d) => ({
      id: d.id,
      seq: d.seq,
      text: d.text,
      evidence_quote: d.evidenceQuote,
      speaker: d.speaker,
      start_s: d.startS,
      end_s: d.endS,
    })),
    action_items: items.map((a) => ({
      id: a.id,
      seq: a.seq,
      text: a.text,
      owner: a.owner,
      due: a.due,
      evidence_quote: a.evidenceQuote,
      speaker: a.speaker,
      start_s: a.startS,
      end_s: a.endS,
    })),
  });
});

export const getMeetingTranscript = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const meetingId = String(req.params.id);
    const meeting = await requireOwnedMeeting(meetingId, userId);

    // Not delegated to getArtifactStore(): its message names the env vars and
    // asyncHandler forwards non-AppError messages to the client verbatim.
    if (!systemConfig.R2_ENDPOINT) {
      throw new ConflictError("transcripts are not available on this server");
    }

    let artifact;
    try {
      artifact = await getArtifactStore().resolve(
        `${meetingId}.named-transcript.jsonl`
      );
    } catch (err) {
      // 409 not 404 — the meeting exists, only the artifact is missing.
      if (err instanceof ArtifactNotFoundError) {
        throw new ConflictError(
          `transcript for ${meetingId} is still being prepared`
        );
      }
      throw err;
    }

    try {
      const segments = loadNamedTranscript(artifact.path);
      res.status(200).json({
        meeting_id: meetingId,
        recording_offset_s: meeting.recordingOffsetS,
        turns: segments.map((s) => ({
          speaker: s.speaker,
          start_s: s.start,
          end_s: s.end,
          text: s.text,
        })),
      });
    } finally {
      await artifact.cleanup();
    }
  }
);
