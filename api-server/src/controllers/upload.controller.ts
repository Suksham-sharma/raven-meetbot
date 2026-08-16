import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import multer from "multer";
import os from "os";
import { db } from "../db/client";
import { meetings } from "../db/schema";
import { getArtifactStore } from "../diarize/artifactStore";
import { diarizeQueue, memoryQueue, transcodeQueue } from "../lib/queueManager";
import { BadRequestError, UnauthorizedError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

const ALLOWED_MIMES = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/x-wav",
]);

const MAX_FILE_BYTES = 500 * 1024 * 1024;

export const uploadMulter = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype) || file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`unsupported file type: ${file.mimetype}`) as unknown as Error);
    }
  },
});

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

async function handleSingleUpload(req: Request): Promise<{ meetingId: string; recordingKey: string }> {
  const userId = requireUserId(req);
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) throw new BadRequestError("file is required (field name: file)");

  const titleRaw = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const title = titleRaw || file.originalname.replace(/\.[^.]+$/, "") || null;

  const meetingId = generateMeetingId();
  const recordingKey = `${meetingId}.webm`;
  const store = getArtifactStore();

  await store.writeFile(recordingKey, file.path);

  const now = new Date();
  await db.insert(meetings).values({
    id: meetingId,
    ownerId: userId,
    title,
    recordingUrl: recordingKey,
    status: "pending",
    startedAt: now,
    participants: [],
  });

  await transcodeQueue.add("transcode", { meetingId, recordingKey }, { jobId: meetingId });

  const hasDeepgram = Boolean(process.env.DEEPGRAM_API_KEY);
  if (hasDeepgram) {
    await diarizeQueue.add(
      "diarize",
      { meetingId, recordingKey, speakersKey: null, ownerId: userId },
      { jobId: meetingId }
    );
  } else {
    await memoryQueue.add("ingest", { meetingId, ownerId: userId }, { jobId: meetingId });
  }

  try {
    const { unlink } = await import("fs/promises");
    await unlink(file.path).catch(() => {});
  } catch {}

  return { meetingId, recordingKey };
}

export const uploadMeeting = asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = await handleSingleUpload(req);
  const meeting = await db.select().from(meetings).where(eq(meetings.id, meetingId)).then((r) => r[0]);
  res.status(201).json({
    meeting_id: meetingId,
    title: meeting?.title ?? null,
    recording_key: `${meetingId}.webm`,
    status: "pending",
  });
});

export const bulkUploadMeetings = asyncHandler(async (req: Request, res: Response) => {
  const files = (req as unknown as { files?: Express.Multer.File[] }).files;
  if (!files || files.length === 0) throw new BadRequestError("at least one file is required (field name: files)");
  if (files.length > 20) throw new BadRequestError("too many files — max 20 per request");

  const results: Array<{ meeting_id: string; title: string | null; status: string; error?: string }> = [];
  for (const f of files) {
    const fakeReq = { ...req, file: f, body: req.body } as unknown as Request & { file: Express.Multer.File };
    try {
      const { meetingId } = await handleSingleUpload(fakeReq as unknown as Request);
      const [row] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
      results.push({ meeting_id: meetingId, title: row?.title ?? null, status: "pending" });
    } catch (err) {
      results.push({
        meeting_id: "",
        title: f.originalname,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        const { unlink } = await import("fs/promises");
        await unlink(f.path).catch(() => {});
      } catch {}
    }
  }
  res.status(201).json({ meetings: results });
});
