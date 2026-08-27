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
import { db } from "../../platform/db/client";
import { actionItems, chapters, decisions, meetings } from "../../platform/db/schema";
import {
  ArtifactNotFoundError,
  getArtifactStore,
} from "../../platform/artifacts";
import { loadNamedTranscript } from "../../domain/ingest/realSource";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";

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
    status: m.status === "ingested" ? "ready" : m.status,
    status_error: (m as unknown as { statusError?: string | null }).statusError ?? null,
    has_recording: m.recordingUrl != null,
  };
}

export const deleteMeeting = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  await requireOwnedMeeting(meetingId, userId);
  await db.delete(meetings).where(and(eq(meetings.id, meetingId), eq(meetings.ownerId, userId)));
  const store = getArtifactStore();
  const keys = [
    `${meetingId}.webm`,
    `${meetingId}.mp4`,
    `${meetingId}.poster.jpg`,
    `${meetingId}.speakers.jsonl`,
    `${meetingId}.named-transcript.jsonl`,
    `${meetingId}.transcript.jsonl`,
  ];
  await Promise.all(keys.map((k) => store.delete(k)));
  res.status(204).end();
});

export const updateMeeting = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  await requireOwnedMeeting(meetingId, userId);
  const title = req.body?.title;
  if (typeof title !== "string" || !title.trim()) throw new BadRequestError("title must be a non-empty string");
  if (title.length > 200) throw new BadRequestError("title too long");
  const [updated] = await db.update(meetings).set({ title: title.trim() }).where(and(eq(meetings.id, meetingId), eq(meetings.ownerId, userId))).returning();
  res.status(200).json(summarize(updated));
});

export const exportMeeting = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  const meeting = await requireOwnedMeeting(meetingId, userId);
  const fmt = String(req.query.format ?? "json");
  const [chs, decs, items] = await Promise.all([
    db.select().from(chapters).where(eq(chapters.meetingId, meetingId)).orderBy(asc(chapters.seq)),
    db.select().from(decisions).where(eq(decisions.meetingId, meetingId)).orderBy(asc(decisions.seq)),
    db.select().from(actionItems).where(eq(actionItems.meetingId, meetingId)).orderBy(asc(actionItems.seq)),
  ]);
  let turns: { speaker: string; start_s: number; end_s: number; text: string }[] = [];
  try {
    const artifact = await getArtifactStore().resolve(`${meetingId}.named-transcript.jsonl`);
    try {
      const segs = loadNamedTranscript(artifact.path);
      turns = segs.map((s) => ({ speaker: s.speaker, start_s: s.start, end_s: s.end, text: s.text }));
    } finally {
      await artifact.cleanup();
    }
  } catch {}
  if (fmt === "md" || fmt === "markdown") {
    const md = buildExportMarkdown(meeting, chs, decs, items, turns);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${meetingId}.md"`);
    res.status(200).send(md);
    return;
  }
  res.status(200).json({
    meeting: summarize(meeting),
    summary: meeting.summary,
    chapters: chs.map((c) => ({ seq: c.seq, title: c.title, gist: c.gist, start_s: c.startS, end_s: c.endS })),
    decisions: decs.map((d) => ({ id: d.id, seq: d.seq, text: d.text, evidence_quote: d.evidenceQuote, speaker: d.speaker, start_s: d.startS, end_s: d.endS })),
    action_items: items.map((a) => ({ id: a.id, seq: a.seq, text: a.text, owner: a.owner, due: a.due, evidence_quote: a.evidenceQuote, speaker: a.speaker, start_s: a.startS, end_s: a.endS, completed_at: a.completedAt?.toISOString() ?? null })),
    transcript: turns,
  });
});

function buildExportMarkdown(
  meeting: typeof meetings.$inferSelect,
  chs: (typeof chapters.$inferSelect)[],
  decs: (typeof decisions.$inferSelect)[],
  items: (typeof actionItems.$inferSelect)[],
  turns: { speaker: string; start_s: number; end_s: number; text: string }[]
): string {
  const lines: string[] = [];
  lines.push(`# ${meeting.title ?? chs[0]?.title ?? meeting.id}`);
  lines.push("");
  if (meeting.startedAt) lines.push(`Date: ${meeting.startedAt.toISOString()}`);
  if (meeting.participants) lines.push(`Participants: ${(meeting.participants as string[]).join(", ")}`);
  if (meeting.summary) { lines.push(""); lines.push("## Summary"); lines.push(meeting.summary); }
  if (chs.length) { lines.push(""); lines.push("## Chapters"); chs.forEach((c) => lines.push(`- ${c.title} (${c.startS}s–${c.endS}s)${c.gist ? `: ${c.gist}` : ""}`)); }
  if (decs.length) { lines.push(""); lines.push("## Decisions"); decs.forEach((d) => lines.push(`- ${d.text} [${d.speaker ?? "?"} @ ${d.startS}s] — "${d.evidenceQuote}"`)); }
  if (items.length) { lines.push(""); lines.push("## Action Items"); items.forEach((a) => lines.push(`- [${a.completedAt ? "x" : " "}] ${a.text}${a.owner ? ` (${a.owner})` : ""}${a.due ? ` due ${a.due}` : ""} — "${a.evidenceQuote}"`)); }
  if (turns.length) { lines.push(""); lines.push("## Transcript"); turns.forEach((t) => lines.push(`**${t.speaker}** [${t.start_s}s]: ${t.text}`)); }
  return lines.join("\n");
}

export const listMeetings = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const limit = parseLimit(req.query.limit);
  const before = parseBefore(req.query.before);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
  const participant = typeof req.query.participant === "string" ? req.query.participant.trim() : "";
  const from = parseBefore(req.query.from);
  const to = parseBefore(req.query.to);

  const conds = [eq(meetings.ownerId, userId)];
  if (before) conds.push(lt(meetings.startedAt, before));
  if (type) conds.push(eq(meetings.type, type));
  if (participant) conds.push(sql`${meetings.participants} @> ${JSON.stringify([participant])}::jsonb`);
  if (q) conds.push(sql`(${meetings.title} ILIKE ${`%${q}%`} OR ${meetings.summary} ILIKE ${`%${q}%`})`);
  if (from) conds.push(sql`${meetings.startedAt} >= ${from.toISOString()}::timestamptz`);
  if (to) conds.push(sql`${meetings.startedAt} <= ${to.toISOString()}::timestamptz`);

  const [rows, [corpus]] = await Promise.all([
    db
      .select()
      .from(meetings)
      .where(and(...conds))
      .orderBy(desc(meetings.startedAt))
      .limit(limit + 1),
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
      first_chapter: firstChapterBy.get(m.id) ?? null,
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

export const listActionItems = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const limit = parseLimit(
      req.query.limit,
      ACTION_ITEMS_DEFAULT_LIMIT,
      ACTION_ITEMS_MAX_LIMIT
    );

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

async function resolvePlayable(meeting: typeof meetings.$inferSelect) {
  const store = getArtifactStore();
  const candidates = [
    { key: meeting.mp4Key ?? `${meeting.id}.mp4`, mime: "video/mp4", seekable: true },
    { key: `${meeting.id}.webm`, mime: "video/webm", seekable: false },
  ];
  for (const c of candidates) {
    if (await store.exists(c.key)) return c;
  }
  return null;
}

export const getMeetingRecording = asyncHandler(
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
      url: signed ?? `${base}/stream`,
      poster_url: hasPoster ? (signedPoster ?? `${base}/poster`) : null,
      mime: playable.mime,
      seekable: playable.seekable,
      duration_s: meeting.durationS,
      recording_offset_s: meeting.recordingOffsetS,
    });
  }
);

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
  res.setHeader("Accept-Ranges", "bytes");

  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match) {
    res.setHeader("Content-Length", size);
    createReadStream(artifact.path).pipe(res);
    return;
  }

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

export const retryMeeting = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  const meeting = await requireOwnedMeeting(meetingId, userId);

  if (meeting.status !== "failed") {
    throw new ConflictError(`meeting ${meetingId} is not in failed state (status=${meeting.status})`);
  }

  const err = (meeting as unknown as { statusError?: string | null }).statusError ?? "";
  const { diarizeQueue, memoryQueue, transcodeQueue } = await import("../../platform/queues");

  let enqueued: string;
  if (err.startsWith("transcode:")) {
    await transcodeQueue.add(
      "transcode",
      { meetingId, recordingKey: `${meetingId}.webm`, ownerId: userId, title: meeting.title },
      { jobId: `${meetingId}-retry-${Date.now()}` }
    );
    enqueued = "transcode";
  } else if (err.startsWith("diarize:")) {
    await diarizeQueue.add(
      "diarize",
      { meetingId, recordingKey: `${meetingId}.webm`, speakersKey: `${meetingId}.speakers.jsonl`, ownerId: userId },
      { jobId: `${meetingId}-retry-${Date.now()}` }
    );
    enqueued = "diarize";
  } else {
    await memoryQueue.add("ingest", { meetingId, ownerId: userId }, { jobId: `${meetingId}-retry-${Date.now()}` });
    enqueued = "ingest";
  }

  await db.update(meetings).set({ status: "pending", statusError: null }).where(eq(meetings.id, meetingId));

  res.status(202).json({ meeting_id: meetingId, enqueued });
});

export const streamMeetingPoster = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const meetingId = String(req.params.id);
    const meeting = await requireOwnedMeeting(meetingId, userId);

    const key = meeting.posterKey ?? `${meetingId}.poster.jpg`;
    await streamLocalArtifact(res, req, key, "image/jpeg");
  }
);
