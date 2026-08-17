import dotenv from "dotenv";
dotenv.config();

const systemConfig = {
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  BOT_IMAGE: process.env.BOT_IMAGE || "meet-bot:latest",
  SCREENSHOTS_HOST_PATH: process.env.SCREENSHOTS_HOST_PATH || "./screenshots",
  MAX_CONCURRENT_BOTS: Number(process.env.MAX_CONCURRENT_BOTS) || 10,

  AUTH_STATE_HOST_PATH: process.env.AUTH_STATE_HOST_PATH || "",
  RECORDINGS_HOST_PATH: process.env.RECORDINGS_HOST_PATH || "",

  R2_ENDPOINT: process.env.R2_ENDPOINT || "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || "",
  R2_BUCKET: process.env.R2_BUCKET || "meeting-recordings",
  R2_REGION: process.env.R2_REGION || "auto",

  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "",
};

export default systemConfig;
