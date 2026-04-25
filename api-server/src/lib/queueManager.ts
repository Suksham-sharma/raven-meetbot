import { Queue } from "bullmq";
import systemConfig from "../config";

class QueueManager {
  private static instance: QueueManager;
  public meetQueue: Queue;

  private constructor() {
    this.meetQueue = new Queue("gmeet-bot", {
      connection: { url: systemConfig.REDIS_URL },
      defaultJobOptions: {
        attempts: systemConfig.JOB_ATTEMPTS,
        backoff: { type: "exponential", delay: systemConfig.JOB_BACKOFF_MS },
        // Retain failed jobs as a dead-letter queue.
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: false,
      },
    });
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
