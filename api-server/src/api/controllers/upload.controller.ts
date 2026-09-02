import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { meetings } from "../../platform/db/schema";
import { getArtifactStore } from "../../platform/artifacts";
import systemConfig from "../../platform/config";
import { diarizeQueue, memoryQueue, transcodeQueue } from "../../platform/queues";
import { BadRequestError, NotFoundError, UnauthorizedError } from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";
import { assertMeetingQuota } from "../../domain/auth/quota";

const MAX_BYTES = 500 * 1024 * 1024;
const PRESIGN_TTL_S = 3600;

function generateMeetingId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const rand = randomBytes(3).toString("hex");
  return `upload_${date}_${time}_${rand}`;
}

function requireUserId(req: Request): string {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}

function sanitizeTitle(raw: unknown, fallback: string): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, 200);
  const f = String(fallback ?? "").replace(/\.[^.]+$/, "").trim();
  return f ? f.slice(0, 200) : null;
}

function inferContentType(fileName?: string, hint?: string): string {
  if (hint && hint.startsWith("video/")) return hint;
  if (hint && hint.startsWith("audio/")) return hint;
  if (fileName?.endsWith(".mp4")) return "video/mp4";
  if (fileName?.endsWith(".mov")) return "video/quicktime";
  if (fileName?.endsWith(".wav")) return "audio/wav";
  if (fileName?.endsWith(".mp3")) return "audio/mpeg";
  if (fileName?.endsWith(".m4a")) return "audio/mp4";
  return "video/webm";
}

export const presignUpload = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { title: rawTitle, contentType: rawCt, fileName, contentLength } = (req.body ?? {}) as {
    title?: string;
    contentType?: string;
    fileName?: string;
    contentLength?: number;
  };

  if (typeof contentLength === "number" && contentLength > MAX_BYTES) {
    throw new BadRequestError(`file too large — max ${MAX_BYTES} bytes`);
  }
  await assertMeetingQuota(userId);

  const meetingId = generateMeetingId();
  const recordingKey = `${meetingId}.webm`;
  const contentType = inferContentType(fileName, rawCt);
  const title = sanitizeTitle(rawTitle, fileName ?? "");

  await db.insert(meetings).values({
    id: meetingId,
    ownerId: userId,
    title,
    recordingUrl: recordingKey,
    status: "pending",
    startedAt: new Date(),
    participants: [],
  });

  const store = getArtifactStore();
  const presigned = await store.presignUpload(recordingKey, contentType);

  if (presigned) {
    res.status(201).json({
      meeting_id: meetingId,
      key: recordingKey,
      upload_url: presigned,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expires_in: PRESIGN_TTL_S,
    });
    return;
  }

  const uploadUrl = `/api/v1/meetings/${encodeURIComponent(meetingId)}/upload`;
  res.status(201).json({
    meeting_id: meetingId,
    key: recordingKey,
    upload_url: uploadUrl,
    method: "PUT",
    headers: { "Content-Type": contentType },
    expires_in: PRESIGN_TTL_S,
  });
});

export const presignBulkUpload = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const { files } = (req.body ?? {}) as {
    files?: Array<{ title?: string; contentType?: string; fileName?: string; contentLength?: number }>;
  };
  if (!Array.isArray(files) || files.length === 0) throw new BadRequestError("files[] is required");
  if (files.length > 20) throw new BadRequestError("too many files — max 20");
  await assertMeetingQuota(userId, files.length);

  const store = getArtifactStore();
  const out: Array<{ meeting_id: string; key: string; upload_url: string; method: string; headers: Record<string, string> }> = [];

  for (const f of files) {
    if (typeof f.contentLength === "number" && f.contentLength > MAX_BYTES) {
      throw new BadRequestError(`file ${f.fileName ?? ""} too large`);
    }
    const meetingId = generateMeetingId();
    const recordingKey = `${meetingId}.webm`;
    const contentType = inferContentType(f.fileName, f.contentType);
    const title = sanitizeTitle(f.title, f.fileName ?? "");
    await db.insert(meetings).values({
      id: meetingId,
      ownerId: userId,
      title,
      recordingUrl: recordingKey,
      status: "pending",
      startedAt: new Date(),
      participants: [],
    });
    const presigned = await store.presignUpload(recordingKey, contentType);
    const uploadUrl = presigned ?? `/api/v1/meetings/${encodeURIComponent(meetingId)}/upload`;
    out.push({ meeting_id: meetingId, key: recordingKey, upload_url: uploadUrl, method: "PUT", headers: { "Content-Type": contentType } });
  }

  res.status(201).json({ meetings: out });
});

export const directUpload = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting || meeting.ownerId !== userId) throw new NotFoundError(`meeting ${meetingId} not found`);

  const key = meeting.recordingUrl ?? `${meetingId}.webm`;
  const contentType = (req.headers["content-type"] as string) || "video/webm";
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_BYTES) throw new BadRequestError("file too large");

  const store = getArtifactStore();
  await store.writeStream(key, req as unknown as NodeJS.ReadableStream, contentType);

  res.status(200).json({ meeting_id: meetingId, key, bytes: contentLength || null });
});

export const completeUpload = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting || meeting.ownerId !== userId) throw new NotFoundError(`meeting ${meetingId} not found`);

  const recordingKey = meeting.recordingUrl ?? `${meetingId}.webm`;
  const store = getArtifactStore();
  if (!(await store.exists(recordingKey))) {
    throw new BadRequestError("upload not found — PUT the file to upload_url first");
  }

  await transcodeQueue.add(
    "transcode",
    { meetingId, recordingKey, ownerId: userId, title: meeting.title },
    { jobId: meetingId }
  );

  const hasDeepgram = Boolean(systemConfig.DEEPGRAM_API_KEY);
  if (hasDeepgram) {
    await diarizeQueue.add("diarize", { meetingId, recordingKey, speakersKey: null, ownerId: userId }, { jobId: meetingId });
  } else {
    await memoryQueue.add("ingest", { meetingId, ownerId: userId }, { jobId: meetingId });
  }

  res.status(202).json({ meeting_id: meetingId, status: "processing", recording_key: recordingKey });
});
