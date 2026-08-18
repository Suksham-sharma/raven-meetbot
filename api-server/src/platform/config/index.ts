import dotenv from "dotenv";
import path from "path";
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const systemConfig = {
  PORT: Number(process.env.PORT) || 3000,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/meetbot",

  // JWT_SECRET MUST be set in real deployments; this default is insecure.
  JWT_SECRET: process.env.JWT_SECRET || "dev-insecure-secret-change-me-please-0123456789",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  JWT_MAX_AGE_MS: Number(process.env.JWT_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000,
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  WEB_APP_URL: process.env.WEB_APP_URL || "http://localhost:3000",
  DEFAULT_USER_EMAIL: process.env.DEFAULT_USER_EMAIL || "dev@raven.local",
  DEFAULT_USER_PASSWORD: process.env.DEFAULT_USER_PASSWORD || "devpassword",
  DEFAULT_USER_NAME: process.env.DEFAULT_USER_NAME || "Dev User",

  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "",

  AGENT_AFTER_INGEST: process.env.AGENT_AFTER_INGEST !== "false",
  AGENT_DRY_RUN: process.env.AGENT_DRY_RUN === "true",
  LINEAR_API_KEY: process.env.LINEAR_API_KEY || "",
  LINEAR_TEAM_ID: process.env.LINEAR_TEAM_ID || "",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI ||
    "http://localhost:3000/api/v1/auth/google/callback",
  CALENDAR_TOKEN_KEY: process.env.CALENDAR_TOKEN_KEY || "",
  CALENDAR_LOOKAHEAD_HOURS: Number(process.env.CALENDAR_LOOKAHEAD_HOURS) || 48,
  CALENDAR_SYNC_INTERVAL_MS:
    Number(process.env.CALENDAR_SYNC_INTERVAL_MS) || 5 * 60 * 1000,
  CALENDAR_JOIN_EARLY_MS:
    Number(process.env.CALENDAR_JOIN_EARLY_MS) || 60 * 1000,
  CALENDAR_MAX_LATE_MS:
    Number(process.env.CALENDAR_MAX_LATE_MS) || 5 * 60 * 1000,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_EXTRACT_MODEL: process.env.OPENAI_EXTRACT_MODEL || "gpt-4o-mini",
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
  OPENAI_ASK_MODEL: process.env.OPENAI_ASK_MODEL || "gpt-4o-mini",
  OPENAI_JUDGE_MODEL: process.env.OPENAI_JUDGE_MODEL || "gpt-4o-mini",
  OPENAI_GEN_MODEL: process.env.OPENAI_GEN_MODEL || "gpt-4o-mini",
  OPENAI_PROPOSE_MODEL: process.env.OPENAI_PROPOSE_MODEL || "gpt-4o-mini",

  R2_ENDPOINT: process.env.R2_ENDPOINT || "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET: process.env.R2_BUCKET || "meeting-recordings",
  R2_REGION: process.env.R2_REGION || "auto",

  RECORDINGS_DIR:
    process.env.RECORDINGS_DIR ||
    path.resolve(process.cwd(), "..", "recordings"),

  JOB_ATTEMPTS: Number(process.env.JOB_ATTEMPTS) || 3,
  JOB_BACKOFF_MS: Number(process.env.JOB_BACKOFF_MS) || 5000,
};

export default systemConfig;
