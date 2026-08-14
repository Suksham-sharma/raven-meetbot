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
  // Also enqueued on bot exit, deliberately as its own queue rather than a
  // stage of diarize: an hour-long encode is CPU-bound minutes, and sharing a
  // queue would park every later meeting's transcript behind it. The two are
  // independent — one reads the audio, the other the video — so they run in
  // parallel and the transcript still lands fast.
  public transcodeQueue: Queue;
  // v3 action proposer: enqueued by the memory worker after ingest.
  public agentQueue: Queue;

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
    this.transcodeQueue = new Queue("transcode", { connection, defaultJobOptions });
    this.agentQueue = new Queue("agent", { connection, defaultJobOptions });
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

// ownerId rides the job from the join request through diarize/ingest; null for
// eval + seed ingests (backfilled via seed:owner).
export interface MemoryJob {
  meetingId: string;
  ownerId?: string | null;
}

export interface AgentJob {
  meetingId: string;
}

// Keys are the bot's R2 upload keys ({meetingId}.webm / {meetingId}.speakers.jsonl).
export interface DiarizeJob {
  meetingId: string;
  recordingKey: string;
  speakersKey: string;
  ownerId?: string | null;
}

export interface TranscodeJob {
  meetingId: string;
  recordingKey: string;
}
