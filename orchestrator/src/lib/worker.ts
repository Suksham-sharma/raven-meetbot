import { Job } from "bullmq";
import redisManager from "./redisManager";
import dockerManager from "./dockerManager";
import systemConfig from "../config";

interface MeetBotJob {
  url: string;
  botName: string;
  maxDurationMinutes: number | null;
}

const processJob = async (job: Job<MeetBotJob>) => {
  const { url, botName, maxDurationMinutes } = job.data;
  console.log(`[Worker] Processing job ${job.id}: ${url}`);

  const exitCode = await dockerManager.spawnBot({
    url,
    botName,
    maxDurationMinutes,
  });
  
  if (exitCode !== 0) {
    throw new Error(`Bot container exited with code ${exitCode}`);
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
