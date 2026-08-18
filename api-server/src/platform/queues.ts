import { Queue } from "bullmq";
import systemConfig from "./config/index";

class QueueManager {
  private static instance: QueueManager;
  public meetQueue: Queue;
  public memoryQueue: Queue;
  public diarizeQueue: Queue;
  // Its own queue rather than a diarize stage: an hour-long encode would park
  // every later meeting's transcript behind it.
  public transcodeQueue: Queue;
  public agentQueue: Queue;
  public controlQueue: Queue;
  public calendarQueue: Queue;

  private constructor() {
    const defaultJobOptions = {
      attempts: systemConfig.JOB_ATTEMPTS,
      backoff: { type: "exponential" as const, delay: systemConfig.JOB_BACKOFF_MS },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: false,
    };
    const connection = { url: systemConfig.REDIS_URL };

    this.meetQueue = new Queue("gmeet-bot", { connection, defaultJobOptions });
    this.memoryQueue = new Queue("memory", { connection, defaultJobOptions });
    this.diarizeQueue = new Queue("diarize", { connection, defaultJobOptions });
    this.transcodeQueue = new Queue("transcode", { connection, defaultJobOptions });
    this.agentQueue = new Queue("agent", { connection, defaultJobOptions });
    this.controlQueue = new Queue("bot-control", { connection });
    this.calendarQueue = new Queue("calendar-sync", { connection, defaultJobOptions });
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
export const transcodeQueue = queueManager.transcodeQueue;
export const agentQueue = queueManager.agentQueue;
export const controlQueue = queueManager.controlQueue;
export const calendarQueue = queueManager.calendarQueue;

export interface MemoryJob {
  meetingId: string;
  ownerId?: string | null;
  title?: string | null;
  scheduledStartMs?: number | null;
}

export interface AgentJob {
  meetingId: string;
}

export interface DiarizeJob {
  meetingId: string;
  recordingKey: string;
  speakersKey?: string | null;
  ownerId?: string | null;
  title?: string | null;
  scheduledStartMs?: number | null;
}

export interface TranscodeJob {
  meetingId: string;
  recordingKey: string;
}
