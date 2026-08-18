import { Request, Response } from "express";
import { BadRequestError, UnauthorizedError } from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";
import { meetQueue } from "../../platform/queues";

export const joinMeet = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.userId;
  if (!ownerId) throw new UnauthorizedError();

  const { url, botName, maxDurationMinutes } = req.body;
  if (!url) throw new BadRequestError("Meeting URL is required");

  const job = await meetQueue.add("join-meet", {
    url,
    botName: botName || "Shadow NoteTaker",
    maxDurationMinutes: maxDurationMinutes || null,
    ownerId,
    title: null,
    scheduledStartMs: null,
    calendarScheduleId: null,
  });

  res.status(200).json({
    message: "Bot dispatched to join meeting",
    jobId: job.id,
  });
});
