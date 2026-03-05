import { Job } from "bullmq";
import { createInterface } from "readline";
import redisManager from "./redisManager";
import dockerManager from "./dockerManager";
import { MeetBotJob, StatusEvent, TERMINAL_STATES } from "../types/bot";
import systemConfig from "../config";

const STATUS_PREFIX = "[BOT_STATUS] ";

function updateProgress(job: Job, state: string, timeline: StatusEvent[]) {
  return job.updateProgress({ state, timeline });
}

const processJob = async (job: Job<MeetBotJob>) => {
  const { url, botName, maxDurationMinutes } = job.data;
  console.log(`[Worker] Processing job ${job.id}: ${url}`);

  const timeline: StatusEvent[] = [
    { state: "dispatched", timestamp: new Date().toISOString() },
  ];
  await updateProgress(job, "dispatched", timeline);

  const { stdout, wait } = await dockerManager.spawnBot({ url, botName, maxDurationMinutes });

  // Process status lines in real-time as the bot runs
  const rl = createInterface({ input: stdout });
  for await (const line of rl) {
    if (!line.startsWith(STATUS_PREFIX)) continue;
    try {
      const event: StatusEvent = JSON.parse(line.slice(STATUS_PREFIX.length));
      timeline.push(event);
      await updateProgress(job, event.state, timeline);
    } catch {}
  }

  const exitCode = await wait();
  const lastState = timeline[timeline.length - 1].state;

  // Crash detection: non-zero exit without a terminal state
  if (exitCode !== 0 && !TERMINAL_STATES.has(lastState)) {
    timeline.push({ state: "error", timestamp: new Date().toISOString(), reason: `container exited unexpectedly (code ${exitCode})` });
    await updateProgress(job, "error", timeline);
  }

  if (exitCode !== 0) {
    throw new Error(`Bot container exited with code ${exitCode}`);
  }

  // Clean exit but no terminal state reported
  if (!TERMINAL_STATES.has(lastState)) {
    timeline.push({ state: "ended", timestamp: new Date().toISOString() });
    await updateProgress(job, "ended", timeline);
  }

  console.log(`[Worker] Job ${job.id} completed successfully`);
};

const worker = redisManager.createWorker(processJob, { concurrency: systemConfig.MAX_CONCURRENT_BOTS }
);

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[Worker] Worker error:", err);
});

export default worker;
