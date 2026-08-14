import { Request, Response } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  max,
  min,
  sql,
} from "drizzle-orm";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
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
const ACTION_ITEMS_DEFAULT_LIMIT = 20;
const ACTION_ITEMS_MAX_LIMIT = 100;

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

function parseLimit(
  raw: unknown,
  fallback = DEFAULT_LIMIT,
  max = MAX_LIMIT
): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestError("limit must be a positive integer");
  }
  return Math.min(n, max);
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

  const [rows, [corpus]] = await Promise.all([
    db
      .select()
      .from(meetings)
      .where(and(...conds))
      .orderBy(desc(meetings.startedAt))
      .limit(limit + 1),
    // The whole archive, not this page: it states the boundary an answer was
    // searched against, so it must not shrink as you paginate.
    db
      .select({
        total: count(),
        from: min(meetings.startedAt),
        to: max(meetings.startedAt),
      })
      .from(meetings)
      .where(eq(meetings.ownerId, userId)),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  // One grouped query for the page, not one per row: at limit=200 the per-row
  // shape would be 200 round trips to name 200 rows.
  const firstChapters = await db
    .selectDistinctOn([chapters.meetingId], {
      meetingId: chapters.meetingId,
      title: chapters.title,
    })
    .from(chapters)
    .where(
      inArray(
        chapters.meetingId,
        page.map((m) => m.id)
      )
    )
    .orderBy(chapters.meetingId, asc(chapters.seq));

  const firstChapterBy = new Map(firstChapters.map((c) => [c.meetingId, c.title]));

  res.status(200).json({
    meetings: page.map((m) => ({
      ...summarize(m),
      // title is null for every real meeting, so the first chapter is what the
      // row is actually named after.
      first_chapter: firstChapterBy.get(m.id) ?? null,
      // The recent-meeting cards on the home surface show a line of what
      // happened; the archive rows below them do not. Sent on every row, used
      // by the few the UI renders as cards.
      summary: m.summary,
    })),
    next_before: hasMore ? (last?.startedAt?.toISOString() ?? null) : null,
    corpus: {
      total: corpus?.total ?? 0,
      from: corpus?.from?.toISOString() ?? null,
      to: corpus?.to?.toISOString() ?? null,
    },
  });
});

// GET /api/v1/action-items?limit=
export const listActionItems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const limit = parseLimit(
      req.query.limit,
      ACTION_ITEMS_DEFAULT_LIMIT,
      ACTION_ITEMS_MAX_LIMIT
    );

    // action_items has no owner column of its own; the join to meetings is the
    // entire tenancy boundary for this route.
    const rows = await db
      .select({
        id: actionItems.id,
        text: actionItems.text,
        owner: actionItems.owner,
        due: actionItems.due,
        evidenceQuote: actionItems.evidenceQuote,
        speaker: actionItems.speaker,
        startS: actionItems.startS,
        endS: actionItems.endS,
        completedAt: actionItems.completedAt,
        meetingId: actionItems.meetingId,
        meetingTitle: meetings.title,
        meetingStartedAt: meetings.startedAt,
      })
      .from(actionItems)
      .innerJoin(meetings, eq(meetings.id, actionItems.meetingId))
      .where(eq(meetings.ownerId, userId))
      // Open first: a settled item is no longer a follow-up, and without this
      // the list a user actually acts on drifts under the ones they finished.
      .orderBy(
        asc(sql`(${actionItems.completedAt} is not null)`),
        desc(meetings.startedAt),
        asc(actionItems.seq)
      )
      .limit(limit);

    res.status(200).json({
      items: rows.map((r) => ({
        id: r.id,
        text: r.text,
        owner: r.owner,
        due: r.due,
        evidence_quote: r.evidenceQuote,
        speaker: r.speaker,
        start_s: r.startS,
        end_s: r.endS,
        completed_at: r.completedAt?.toISOString() ?? null,
        meeting_id: r.meetingId,
        meeting_title: r.meetingTitle,
        meeting_started_at: r.meetingStartedAt?.toISOString() ?? null,
      })),
    });
  }
);

// PATCH /api/v1/action-items/:id  { completed: boolean }
export const setActionItemCompleted = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      throw new BadRequestError("id must be a positive integer");
    }

    const { completed } = req.body ?? {};
    if (typeof completed !== "boolean") {
      throw new BadRequestError("completed must be a boolean");
    }

    // Ownership is checked in the same statement that writes, so there is no
    // window between the two. 404 rather than 403 on someone else's row, so an
    // id cannot be probed for existence — the rule the rest of this file follows.
    const [updated] = await db
      .update(actionItems)
      .set({ completedAt: completed ? new Date() : null })
      .where(
        and(
          eq(actionItems.id, id),
          inArray(
            actionItems.meetingId,
            db
              .select({ id: meetings.id })
              .from(meetings)
              .where(eq(meetings.ownerId, userId))
          )
        )
      )
      .returning({
        id: actionItems.id,
        completedAt: actionItems.completedAt,
      });

    if (!updated) throw new NotFoundError("action item not found");

    res.status(200).json({
      id: updated.id,
      completed_at: updated.completedAt?.toISOString() ?? null,
    });
  }
);

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

// The transcoded mp4 if it exists, else the raw capture. The raw webm has no
// duration and no cues, so it plays but cannot seek — and every citation is a
// seek. `seekable` says which one the player got so the UI can be honest about
// it rather than looking broken.
async function resolvePlayable(meeting: typeof meetings.$inferSelect) {
  const store = getArtifactStore();
  const candidates = [
    // Fall back to the conventional key when the column is null: transcode may
    // have finished while no meeting row existed yet to write it to.
    { key: meeting.mp4Key ?? `${meeting.id}.mp4`, mime: "video/mp4", seekable: true },
    { key: `${meeting.id}.webm`, mime: "video/webm", seekable: false },
  ];
  for (const c of candidates) {
    // A key in the column is not proof of an object; an mp4 deleted underneath
    // us should fall back to the webm rather than hand the player a 404.
    if (await store.exists(c.key)) return c;
  }
  return null;
}

// GET /api/v1/meetings/:id/recording
export const getMeetingRecording = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const meetingId = String(req.params.id);
    const meeting = await requireOwnedMeeting(meetingId, userId);

    const playable = await resolvePlayable(meeting);
    if (!playable) {
      // 409 not 404 — the meeting exists, the media is still being made.
      throw new ConflictError(
        `recording for ${meetingId} is still being prepared`
      );
    }

    const store = getArtifactStore();
    const posterKey = meeting.posterKey ?? `${meetingId}.poster.jpg`;
    const [signed, signedPoster, hasPoster] = await Promise.all([
      store.playbackUrl(playable.key),
      store.playbackUrl(posterKey),
      store.exists(posterKey),
    ]);

    const base = `/api/v1/meetings/${encodeURIComponent(meetingId)}/recording`;
    res.status(200).json({
      meeting_id: meetingId,
      // Presigned when the store can sign, so video bytes go browser→R2 direct.
      // Local disk cannot, so the browser streams back through this process.
      url: signed ?? `${base}/stream`,
      poster_url: hasPoster ? (signedPoster ?? `${base}/poster`) : null,
      mime: playable.mime,
      seekable: playable.seekable,
      duration_s: meeting.durationS,
      // The player seeks to citation start_s + this. Sent with the media so a
      // caller cannot build a deep link without it.
      recording_offset_s: meeting.recordingOffsetS,
    });
  }
);

// Streams a local artifact honouring Range. Only reachable in local-disk mode:
// when the store can presign, /recording hands the browser that URL instead and
// nothing routes here.
async function streamLocalArtifact(
  res: Response,
  req: Request,
  key: string,
  mime: string
): Promise<void> {
  const store = getArtifactStore();
  if (await store.playbackUrl(key)) {
    throw new ConflictError("this artifact is served by signed URL");
  }

  let artifact;
  try {
    artifact = await store.resolve(key);
  } catch (err) {
    if (err instanceof ArtifactNotFoundError) {
      throw new ConflictError(`${key} is still being prepared`);
    }
    throw err;
  }

  const { size } = await stat(artifact.path);
  res.setHeader("Content-Type", mime);
  // Without this the browser will not seek at all — it assumes one long stream.
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match) {
    res.setHeader("Content-Length", size);
    createReadStream(artifact.path).pipe(res);
    return;
  }

  // An open-ended suffix range ("bytes=-500") counts back from the end.
  const [, rawStart, rawEnd] = match;
  const start = rawStart ? Number(rawStart) : size - Number(rawEnd);
  const end = rawStart ? (rawEnd ? Number(rawEnd) : size - 1) : size - 1;

  if (!Number.isFinite(start) || start < 0 || start > end || end >= size) {
    res.setHeader("Content-Range", `bytes */${size}`);
    res.status(416).end();
    return;
  }

  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.setHeader("Content-Length", end - start + 1);
  createReadStream(artifact.path, { start, end }).pipe(res);
}

// GET /api/v1/meetings/:id/recording/stream
export const streamMeetingRecording = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const meetingId = String(req.params.id);
    const meeting = await requireOwnedMeeting(meetingId, userId);

    const playable = await resolvePlayable(meeting);
    if (!playable) {
      throw new ConflictError(
        `recording for ${meetingId} is still being prepared`
      );
    }
    await streamLocalArtifact(res, req, playable.key, playable.mime);
  }
);

// GET /api/v1/meetings/:id/recording/poster
export const streamMeetingPoster = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const meetingId = String(req.params.id);
    const meeting = await requireOwnedMeeting(meetingId, userId);

    const key = meeting.posterKey ?? `${meetingId}.poster.jpg`;
    await streamLocalArtifact(res, req, key, "image/jpeg");
  }
);
