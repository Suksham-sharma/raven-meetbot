import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const config = {
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/meetbot",

  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "",

  DIARIZE_WORKER_CONCURRENCY: Number(process.env.DIARIZE_WORKER_CONCURRENCY) || 1,
  TRANSCODE_WORKER_CONCURRENCY: Number(process.env.TRANSCODE_WORKER_CONCURRENCY) || 1,
  TRANSCODE_LOCK_MS: Number(process.env.TRANSCODE_LOCK_MS) || 30 * 60_000,
  INGEST_AFTER_DIARIZE: process.env.INGEST_AFTER_DIARIZE !== "false",

  R2_ENDPOINT: process.env.R2_ENDPOINT || "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET: process.env.R2_BUCKET || "meeting-recordings",
  R2_REGION: process.env.R2_REGION || "auto",

  RECORDINGS_DIR:
    process.env.RECORDINGS_DIR || path.resolve(process.cwd(), "..", "recordings"),

  JOB_ATTEMPTS: Number(process.env.JOB_ATTEMPTS) || 3,
  JOB_BACKOFF_MS: Number(process.env.JOB_BACKOFF_MS) || 5000,
};

export default config;
