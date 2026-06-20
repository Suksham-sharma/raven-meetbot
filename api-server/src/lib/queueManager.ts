import { Queue } from "bullmq";
import systemConfig from "../config";

class QueueManager {
  private static instance: QueueManager;
  public meetQueue: Queue;
  // Ingest queue (D1): the bot enqueues { meetingId } here when a recording is
  // done; the memory worker (same codebase, separate process) runs the full
  // ingest. Shares retry/backoff with the bot queue.
  public memoryQueue: Queue;

  private constructor() {
    const defaultJobOptions = {
      attempts: systemConfig.JOB_ATTEMPTS,
      backoff: { type: "exponential" as const, delay: systemConfig.JOB_BACKOFF_MS },
      // Retain failed jobs as a dead-letter queue.
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    };
    const connection = { url: systemConfig.REDIS_URL };

    this.meetQueue = new Queue("gmeet-bot", { connection, defaultJobOptions });
    this.memoryQueue = new Queue("memory", { connection, defaultJobOptions });
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }
}

const queueManager = QueueManager.getInstance();
export const meetQueue = queueManager.meetQueue;
export const memoryQueue = queueManager.memoryQueue;

// Payload of one ingest job. meetingId resolves to a transcript source (R2 in
// production, the seed loader in dev).
export interface MemoryJob {
  meetingId: string;
}
