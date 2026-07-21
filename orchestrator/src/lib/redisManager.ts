import { Worker, Queue, Processor, WorkerOptions } from "bullmq";
import systemConfig from "../config";

// Enqueued on successful bot exit; consumed by the api-server diarize worker.
export interface DiarizeJob {
  meetingId: string;
  recordingKey: string;
  speakersKey: string;
  ownerId?: string | null;
}

class RedisManager {
  private static instance: RedisManager;
  private queue: Queue;
  private diarizeQueue: Queue;

  private constructor() {
    const connection = { url: systemConfig.REDIS_URL };
    this.queue = new Queue("gmeet-bot", { connection });
    this.diarizeQueue = new Queue("diarize", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: false,
      },
    });
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

  // Best-effort: never fails the (already-complete) bot job. jobId dedupes retries.
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

  createWorker(processor: Processor, options?: Omit<WorkerOptions, "connection">) {
    return new Worker("gmeet-bot", processor, {
      connection: { url: systemConfig.REDIS_URL },
      ...options
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    await this.diarizeQueue.close();
    console.log("[RedisManager] Queue closed");
  }
}

const redisManager = RedisManager.getInstance();
export default redisManager;
