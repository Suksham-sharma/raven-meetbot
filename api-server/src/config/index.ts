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
  // Agentic /ask loop model. gpt-4o-mini is a cheap default; bump to gpt-4o for
  // stronger multi-step reasoning (swappable so the eval can compare).
  OPENAI_ASK_MODEL: process.env.OPENAI_ASK_MODEL || "gpt-4o-mini",
  // LLM-as-judge model for the answer-quality eval (faithfulness / relevancy).
  // Ideally a DIFFERENT/stronger model than the one under test (less self-bias) —
  // default gpt-4o-mini for cost; set to gpt-4o for a more credible judge.
  OPENAI_JUDGE_MODEL: process.env.OPENAI_JUDGE_MODEL || "gpt-4o-mini",
  // Cheap model for the offline eval-seed transcript generator (dev tool only).
  OPENAI_GEN_MODEL: process.env.OPENAI_GEN_MODEL || "gpt-4o-mini",

  JOB_ATTEMPTS: Number(process.env.JOB_ATTEMPTS) || 3,
  JOB_BACKOFF_MS: Number(process.env.JOB_BACKOFF_MS) || 5000,
};

export default systemConfig;
