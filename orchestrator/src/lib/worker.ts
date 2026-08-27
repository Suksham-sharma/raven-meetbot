import { Job, UnrecoverableError } from "bullmq";
import { createInterface } from "readline";
import redisManager from "./redisManager";
import dockerManager from "./dockerManager";
import {
  MeetBotJob,
  StatusEvent,
  BotMetrics,
  TERMINAL_STATES,
  POST_JOIN_STATES,
} from "../types/bot";
import systemConfig from "../config";

const STATUS_PREFIX = "[BOT_STATUS] ";
const METRICS_PREFIX = "[BOT_METRICS] ";

const processJob = async (job: Job<MeetBotJob>) => {
  const {
    url,
    botName,
    maxDurationMinutes,
    ownerId,
    title,
    scheduledStartMs,
  } = job.data;

  if (
    scheduledStartMs &&
    Date.now() - scheduledStartMs > systemConfig.CALENDAR_MAX_LATE_MS
  ) {
    throw new UnrecoverableError("calendar join window expired");
  }
  console.log(
    `[Worker] Processing job ${job.id} (attempt ${job.attemptsMade + 1}): ${url}`
  );

  const prior =
    (job.progress as {
      recording?: string | null;
      speakers?: string | null;
      metrics?: BotMetrics | null;
    }) || {};
  const timeline: StatusEvent[] = [];
  let recording: string | null = prior.recording ?? null;
  let speakers: string | null = prior.speakers ?? null;
  let metrics: BotMetrics | null = prior.metrics ?? null;

  const lastState = () =>
    timeline.length ? timeline[timeline.length - 1].state : "dispatched";

  const persist = (state: string) =>
    job.updateProgress({ state, timeline, recording, speakers, metrics });

  const sync = async (event: StatusEvent) => {
    timeline.push(event);
    await persist(event.state);
  };

  await sync({ state: "dispatched", timestamp: new Date().toISOString() });

  try {
    const { stdout, wait } = await dockerManager.spawnBot({
      url,
      botName,
      maxDurationMinutes,
      jobId: job.id!,
      scheduledStartMs,
    });

    const rl = createInterface({ input: stdout });
    for await (const line of rl) {
      if (line.startsWith(STATUS_PREFIX)) {
        try {
          const event: StatusEvent = JSON.parse(line.slice(STATUS_PREFIX.length));
          if (typeof event.recording === "string") recording = event.recording;
          if (typeof event.speakers === "string") speakers = event.speakers;
          await sync(event);
        } catch {}
      } else if (line.startsWith(METRICS_PREFIX)) {
        try {
          metrics = JSON.parse(line.slice(METRICS_PREFIX.length)) as BotMetrics;
          await persist(lastState());
        } catch {}
      }
    }

    const exitCode = await wait();

    if (exitCode !== 0) {
      if (!TERMINAL_STATES.has(lastState())) {
        await sync({
          state: "error",
          timestamp: new Date().toISOString(),
          reason: `container exited unexpectedly (code ${exitCode})`,
        });
      }
      throw new Error(`Bot container exited with code ${exitCode}`);
    }

    if (!TERMINAL_STATES.has(lastState())) {
      await sync({ state: "ended", timestamp: new Date().toISOString() });
    }

    console.log(`[Worker] Job ${job.id} completed successfully`);

    const emptyRoom = timeline.some(
      (event) =>
        event.reason === "alone_too_long" &&
        event.hadOtherParticipants === false
    );

    if (recording && !emptyRoom) {
      const meetingId = recording.replace(/\.webm$/, "");
      await redisManager.enqueueTranscode({
        meetingId,
        recordingKey: recording,
        ownerId,
        title,
        scheduledStartMs,
      });

      if (speakers) {
        await redisManager.enqueueDiarize({
          meetingId,
          recordingKey: recording,
          speakersKey: speakers,
          ownerId,
          title,
          scheduledStartMs,
        });
      } else {
        console.warn(
          `[Worker] Job ${job.id}: skipping diarize hand-off (speakers=none)`
        );
      }
    } else {
      console.warn(`[Worker] Job ${job.id}: recording unavailable or suppressed`);
    }
  } catch (err) {
    if (
      !(err instanceof UnrecoverableError) &&
      timeline.some((e) => POST_JOIN_STATES.has(e.state))
    ) {
      throw new UnrecoverableError(
        err instanceof Error ? err.message : String(err)
      );
    }
    throw err;
  }
};

const controlWorker = redisManager.createControlWorker(async (job) => {
  const { jobId } = job.data as { jobId: string };
  if (!jobId) throw new Error("jobId required");
  const stopped = await dockerManager.stopByJobId(jobId);
  if (!stopped) throw new Error(`No running bot for job ${jobId}`);
  console.log(`[ControlWorker] Stopped bot for job ${jobId}`);
});

controlWorker.on("completed", (job) => {
  console.log(`[ControlWorker] Stop completed for job ${job.id}`);
});
controlWorker.on("failed", (job, err) => {
  console.error(`[ControlWorker] Stop failed for job ${job?.id}:`, err.message);
});

const worker = redisManager.createWorker(processJob, {
  concurrency: systemConfig.MAX_CONCURRENT_BOTS,
});

worker.on("failed", (job, err) => {
  const maxAttempts = job?.opts.attempts ?? 1;
  const willRetry =
    !!job && err.name !== "UnrecoverableError" && job.attemptsMade < maxAttempts;
  if (willRetry) {
    console.warn(
      `[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${maxAttempts}), will retry: ${err.message}`
    );
  } else {
    console.error(
      `[Worker] Job ${job?.id} dead-lettered after ${job?.attemptsMade} attempt(s): ${err.message}`
    );
  }
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err);
});

export default worker;
