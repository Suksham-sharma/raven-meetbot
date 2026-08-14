import dotenv from "dotenv";
import path from "path";
// api-server/.env first, then repo-root .env (Deepgram + R2 creds live there;
// dotenv won't clobber already-set vars).
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const systemConfig = {
  PORT: Number(process.env.PORT) || 3000,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/meetbot",

  // Auth (simple JWT). JWT_SECRET MUST be set in real deployments — the dev
  // default is intentionally insecure. Default user owns pre-auth meetings (seed:owner).
  JWT_SECRET: process.env.JWT_SECRET || "dev-insecure-secret-change-me-please-0123456789",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  JWT_MAX_AGE_MS: Number(process.env.JWT_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000,
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  DEFAULT_USER_EMAIL: process.env.DEFAULT_USER_EMAIL || "dev@raven.local",
  DEFAULT_USER_PASSWORD: process.env.DEFAULT_USER_PASSWORD || "devpassword",
  DEFAULT_USER_NAME: process.env.DEFAULT_USER_NAME || "Dev User",

  // Deepgram batch transcription for the v4 diarize worker (repo-root .env).
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "",

  // Diarize worker: ffmpeg + a Deepgram call per job → keep concurrency low.
  DIARIZE_WORKER_CONCURRENCY: Number(process.env.DIARIZE_WORKER_CONCURRENCY) || 1,
  // 1 by default: ffmpeg already saturates several cores per encode.
  TRANSCODE_WORKER_CONCURRENCY: Number(process.env.TRANSCODE_WORKER_CONCURRENCY) || 1,
  TRANSCODE_LOCK_MS: Number(process.env.TRANSCODE_LOCK_MS) || 30 * 60_000,
  // Auto-enqueue memory ingest when the named-transcript is ready.
  INGEST_AFTER_DIARIZE: process.env.INGEST_AFTER_DIARIZE !== "false",

  // v3 agent: auto-propose actions after ingest; approval is always human.
  AGENT_AFTER_INGEST: process.env.AGENT_AFTER_INGEST !== "false",
  // Force approves into previews (no external calls) regardless of creds.
  AGENT_DRY_RUN: process.env.AGENT_DRY_RUN === "true",
  LINEAR_API_KEY: process.env.LINEAR_API_KEY || "",
  LINEAR_TEAM_ID: process.env.LINEAR_TEAM_ID || "",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_EXTRACT_MODEL: process.env.OPENAI_EXTRACT_MODEL || "gpt-4o-mini",
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  // Agentic /ask loop model. gpt-4o-mini is a cheap default; bump to gpt-4o for
  // stronger multi-step reasoning (swappable so the eval can compare).
  OPENAI_ASK_MODEL: process.env.OPENAI_ASK_MODEL || "gpt-4o-mini",
  // LLM-as-judge model for the answer-quality eval (faithfulness / relevancy).
  // Ideally a DIFFERENT/stronger model than the one under test (less self-bias) —
  // default gpt-4o-mini for cost; set to gpt-4o for a more credible judge.
  OPENAI_JUDGE_MODEL: process.env.OPENAI_JUDGE_MODEL || "gpt-4o-mini",
  // Cheap model for the offline eval-seed transcript generator (dev tool only).
  OPENAI_GEN_MODEL: process.env.OPENAI_GEN_MODEL || "gpt-4o-mini",
  // v3 action proposer (structured outputs, no tools).
  OPENAI_PROPOSE_MODEL: process.env.OPENAI_PROPOSE_MODEL || "gpt-4o-mini",

  // R2 (S3-compatible) — the artifact store for recordings + transcripts.
  R2_ENDPOINT: process.env.R2_ENDPOINT || "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET: process.env.R2_BUCKET || "meeting-recordings",
  R2_REGION: process.env.R2_REGION || "auto",

  // Where artifacts live when R2 is unset. Default resolves to the repo-root
  // `recordings/` that docker-compose binds into each bot container, so the
  // diarize worker reads exactly what the bot's LocalFileSink wrote.
  RECORDINGS_DIR:
    process.env.RECORDINGS_DIR ||
    path.resolve(process.cwd(), "..", "recordings"),

  JOB_ATTEMPTS: Number(process.env.JOB_ATTEMPTS) || 3,
  JOB_BACKOFF_MS: Number(process.env.JOB_BACKOFF_MS) || 5000,
};

export default systemConfig;
