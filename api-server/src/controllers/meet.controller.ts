import { Request, Response } from "express";
import { BadRequestError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { meetQueue } from "../lib/queueManager";

export const joinMeet = asyncHandler(async (req: Request, res: Response) => {
  const { url, botName, maxDurationMinutes } = req.body;

  if (!url) throw new BadRequestError("Meeting URL is required");

  const job = await meetQueue.add("join-meet", {
    url,
    botName: botName || "Shadow NoteTaker",
    maxDurationMinutes: maxDurationMinutes || null,
  });

  res.status(200).json({
    message: "Bot dispatched to join meeting",
    jobId: job.id,
  });
});
