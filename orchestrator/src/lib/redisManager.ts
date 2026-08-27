import { Worker, Queue, Processor, WorkerOptions } from "bullmq";
import systemConfig from "../config";

export interface DiarizeJob {
  meetingId: string;
  recordingKey: string;
  speakersKey: string;
  ownerId?: string | null;
  title?: string | null;
  scheduledStartMs?: number | null;
}

export interface TranscodeJob {
  meetingId: string;
  recordingKey: string;
  ownerId?: string | null;
  title?: string | null;
  scheduledStartMs?: number | null;
}

class RedisManager {
  private static instance: RedisManager;
  private queue: Queue;
  private diarizeQueue: Queue;
  private transcodeQueue: Queue;
  private controlQueue: Queue;

  private constructor() {
    const connection = { url: systemConfig.REDIS_URL };
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 5000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    };
    this.queue = new Queue("gmeet-bot", { connection });
    this.diarizeQueue = new Queue("diarize", { connection, defaultJobOptions });
    // Fanned out alongside diarize rather than chained after it: one reads the
    // audio, the other the video, so they run in parallel and a long encode
    // never delays the transcript.
    this.transcodeQueue = new Queue("transcode", { connection, defaultJobOptions });
    this.controlQueue = new Queue("bot-control", { connection });
  }

  static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  getQueue(): Queue {
    return this.queue;
  }

  async enqueueDiarize(job: DiarizeJob): Promise<void> {
    try {
      await this.diarizeQueue.add("diarize", job, { jobId: job.meetingId });
      console.log(`[RedisManager] enqueued diarize job for ${job.meetingId}`);
    } catch (err) {
      console.error(
        `[RedisManager] failed to enqueue diarize for ${job.meetingId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  async enqueueTranscode(job: TranscodeJob): Promise<void> {
    try {
      await this.transcodeQueue.add("transcode", job, { jobId: job.meetingId });
      console.log(`[RedisManager] enqueued transcode job for ${job.meetingId}`);
    } catch (err) {
      console.error(
        `[RedisManager] failed to enqueue transcode for ${job.meetingId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  createWorker(processor: Processor, options?: Omit<WorkerOptions, "connection">) {
    return new Worker("gmeet-bot", processor, {
      connection: { url: systemConfig.REDIS_URL },
      ...options
    });
  }

  getControlQueue(): Queue {
    return this.controlQueue;
  }

  createControlWorker(processor: Processor) {
    return new Worker("bot-control", processor, {
      connection: { url: systemConfig.REDIS_URL },
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.diarizeQueue.close();
    await this.transcodeQueue.close();
    await this.controlQueue.close();
    console.log("[RedisManager] Queue closed");
  }
}

const redisManager = RedisManager.getInstance();
export default redisManager;
