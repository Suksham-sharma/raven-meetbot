import { Queue } from "bullmq";
import systemConfig from "../config";

class QueueManager {
  private static instance: QueueManager;
  public meetQueue: Queue;
  // Ingest queue (D1): drained by the memory worker (same codebase, separate process).
  public memoryQueue: Queue;
  // Post-processing: enqueued by the orchestrator on successful bot exit,
  // drained by the diarize worker.
  public diarizeQueue: Queue;

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
    this.diarizeQueue = new Queue("diarize", { connection, defaultJobOptions });
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
export const diarizeQueue = queueManager.diarizeQueue;

export interface MemoryJob {
  meetingId: string;
}

// Keys are the bot's R2 upload keys ({meetingId}.webm / {meetingId}.speakers.jsonl).
export interface DiarizeJob {
  meetingId: string;
  recordingKey: string;
  speakersKey: string;
}
