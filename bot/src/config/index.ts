import dotenv from "dotenv";
dotenv.config();

const botConfig = {
  MEET_URL: process.env.MEET_URL || "",
  BOT_NAME: process.env.BOT_NAME || "Shadow NoteTaker",
  MAX_DURATION_MINUTES: process.env.MAX_DURATION_MINUTES
    ? Number(process.env.MAX_DURATION_MINUTES)
    : null,
  HEADLESS: process.env.HEADLESS === "true",
};

export default botConfig;
