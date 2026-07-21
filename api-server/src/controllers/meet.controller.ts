import { Request, Response } from "express";
import { BadRequestError, UnauthorizedError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { meetQueue } from "../lib/queueManager";

export const joinMeet = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.userId;
  if (!ownerId) throw new UnauthorizedError();

  const { url, botName, maxDurationMinutes } = req.body;
  if (!url) throw new BadRequestError("Meeting URL is required");

  // ownerId rides the job through the whole pipeline (bot → diarize → memory
  // ingest) so the resulting meeting is stamped with its owner at ingest time.
  const job = await meetQueue.add("join-meet", {
    url,
    botName: botName || "Shadow NoteTaker",
    maxDurationMinutes: maxDurationMinutes || null,
    ownerId,
  });

  res.status(200).json({
    message: "Bot dispatched to join meeting",
    jobId: job.id,
  });
});
