import dotenv from "dotenv";
dotenv.config();

const systemConfig = {
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  BOT_IMAGE: process.env.BOT_IMAGE || "meet-bot:latest",
  RECORDINGS_PATH: process.env.RECORDINGS_PATH || "./recordings",
  MAX_CONCURRENT_BOTS: Number(process.env.MAX_CONCURRENT_BOTS) || 10,
};

export default systemConfig;
