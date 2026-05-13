import { Request, Response } from "express";
import { NotFoundError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { meetQueue } from "../lib/queueManager";

export const getBotStatus = asyncHandler(async (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;

  const job = await meetQueue.getJob(jobId);
  if (!job) throw new NotFoundError("Bot not found");

  const jobState = await job.getState();
  const progress = (job.progress as {
    state?: string;
    timeline?: Array<{ state: string; timestamp: string }>;
    recording?: string | null;
    speakers?: string | null;
    metrics?: { deepgramSeconds?: number; r2BytesStored?: number };
  }) || {};

  const currentState = progress.state || mapJobState(jobState);
  const timeline = progress.timeline || [];

  const isCompleted = jobState === "completed" || jobState === "failed";
  const createdAt = new Date(job.timestamp).toISOString();

  // computeMs is the last attempt's container lifetime, from BullMQ job timing.
  const botMetrics = progress.metrics || {};
  const computeMs =
    job.finishedOn && job.processedOn
      ? job.finishedOn - job.processedOn
      : null;

  res.status(200).json({
    jobId: job.id,
    status: currentState,
    meetingUrl: job.data.url,
    botName: job.data.botName,
    timeline,
    createdAt,
    duration: isCompleted && job.finishedOn
      ? Math.round((job.finishedOn - job.timestamp) / 1000)
      : null,
    recording: progress.recording || null,
    speakers: progress.speakers || null,
    cost: {
      deepgramSeconds: botMetrics.deepgramSeconds ?? null,
      r2BytesStored: botMetrics.r2BytesStored ?? null,
      computeMs,
    },
    failedReason: jobState === "failed" ? job.failedReason ?? null : null,
  });
});

export const listBots = asyncHandler(async (_req: Request, res: Response) => {
  const jobs = await meetQueue.getJobs(
    ["active", "waiting", "completed", "failed"],
    0,
    100,
  );

  const bots = jobs.map((job) => {
    const progress = (job.progress as { state?: string }) || {};
    return {
      jobId: job.id,
      status: progress.state || "queued",
      meetingUrl: job.data.url,
      botName: job.data.botName,
      createdAt: new Date(job.timestamp).toISOString(),
    };
  });

  res.status(200).json({ bots });
});

function mapJobState(state: string): string {
  switch (state) {
    case "waiting":
    case "delayed":
      return "queued";
    case "active":
      return "dispatched";
    case "completed":
      return "ended";
    case "failed":
      return "error";
    default:
      return state;
  }
}
