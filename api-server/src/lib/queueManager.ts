import { Queue } from "bullmq";
import systemConfig from "../config";

class QueueManager {
  private static instance: QueueManager;
  public meetQueue: Queue;

  private constructor() {
    this.meetQueue = new Queue("gmeet-bot", {
      connection: { url: systemConfig.REDIS_URL },
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
