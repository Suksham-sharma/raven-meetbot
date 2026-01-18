import { Worker, Queue, Processor, WorkerOptions } from "bullmq";
import systemConfig from "../config";

class RedisManager {
  private static instance: RedisManager;
  private queue: Queue;

  private constructor() {
    this.queue = new Queue("gmeet-bot", {
      connection: { url: systemConfig.REDIS_URL },
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

  createWorker(processor: Processor, options?: Omit<WorkerOptions, "connection">) {
    return new Worker("gmeet-bot", processor, {
      connection: { url: systemConfig.REDIS_URL },
      ...options
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
    console.log("[RedisManager] Queue closed");
  }
}

const redisManager = RedisManager.getInstance();
export default redisManager;
