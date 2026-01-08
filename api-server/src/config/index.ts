import dotenv from "dotenv";
dotenv.config();

const systemConfig = {
  PORT: Number(process.env.PORT) || 3000,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
};

export default systemConfig;
