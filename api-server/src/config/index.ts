import dotenv from "dotenv";
dotenv.config();

const systemConfig = {
  PORT: Number(process.env.PORT) || 3000,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/meetbot",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_EXTRACT_MODEL: process.env.OPENAI_EXTRACT_MODEL || "gpt-4o-mini",
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",

  JOB_ATTEMPTS: Number(process.env.JOB_ATTEMPTS) || 3,
  JOB_BACKOFF_MS: Number(process.env.JOB_BACKOFF_MS) || 5000,
};

export default systemConfig;
