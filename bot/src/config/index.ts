import dotenv from "dotenv";
dotenv.config();

const botConfig = {
  MEET_URL: process.env.MEET_URL || "",
  BOT_NAME: process.env.BOT_NAME || "Shadow NoteTaker",
  MAX_DURATION_MINUTES: process.env.MAX_DURATION_MINUTES
    ? Number(process.env.MAX_DURATION_MINUTES)
    : null,
  SCHEDULED_START_MS: process.env.SCHEDULED_START_MS
    ? Number(process.env.SCHEDULED_START_MS)
    : null,
  SCHEDULED_ALONE_DELAY_MS:
    Number(process.env.SCHEDULED_ALONE_DELAY_MS) || 2 * 60 * 1000,
  HEADLESS: process.env.HEADLESS === "true",

  R2_ENDPOINT: process.env.R2_ENDPOINT || "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET: process.env.R2_BUCKET || "meeting-recordings",
  R2_REGION: process.env.R2_REGION || "auto",

  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "",

  SPEAKER_TIMELINE: process.env.SPEAKER_TIMELINE !== "false",

  AUTH_STATE_PATH: process.env.AUTH_STATE_PATH || ".auth/state.json",
};

export default botConfig;
