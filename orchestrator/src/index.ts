import "./lib/worker";
import redisManager from "./lib/redisManager";
import dockerManager from "./lib/dockerManager";

console.log("[Orchestrator] Starting...");

const shutdown = async (signal: string) => {
  console.log(`[Orchestrator] Received ${signal}, shutting down...`);

  await dockerManager.stopAll();
  await redisManager.close();

  console.log("[Orchestrator] Shutdown complete");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[Orchestrator] Ready, waiting for jobs...");
