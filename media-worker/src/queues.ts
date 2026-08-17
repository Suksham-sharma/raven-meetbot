import { Queue } from "bullmq";
import config from "./config";

export interface DiarizeJob {
  meetingId: string;
  recordingKey: string;
  speakersKey?: string | null;
  ownerId?: string | null;
}

export interface TranscodeJob {
  meetingId: string;
  recordingKey: string;
}

export interface MemoryJob {
  meetingId: string;
  ownerId?: string | null;
}

const connection = { url: config.REDIS_URL };
const defaultJobOptions = {
  attempts: config.JOB_ATTEMPTS,
  backoff: { type: "exponential" as const, delay: config.JOB_BACKOFF_MS },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: false,
};

export const diarizeQueue = new Queue<DiarizeJob>("diarize", { connection, defaultJobOptions });
export const transcodeQueue = new Queue<TranscodeJob>("transcode", { connection, defaultJobOptions });
export const memoryQueue = new Queue<MemoryJob>("memory", { connection, defaultJobOptions });

export { connection };
