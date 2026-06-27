import botConfig from "./config";
import MeetBot from "./services/meetBot";

const main = async () => {
  if (!botConfig.MEET_URL) {
    console.error("[Bot] MEET_URL is required");
    process.exit(1);
  }

  console.log(`[Bot] Starting for ${botConfig.MEET_URL}`);
  console.log(`[Bot] Name: ${botConfig.BOT_NAME}`);

  if (botConfig.MAX_DURATION_MINUTES) {
    console.log(`[Bot] Max duration: ${botConfig.MAX_DURATION_MINUTES} min`);
  }

  const bot = new MeetBot();

  const shutdown = (signal: string) => {
    console.log(`[Bot] Received ${signal}, stopping...`);
    bot.stop();
    // Don't call process.exit — let main() resolve naturally via cleanup
    // Force-kill after 30s if graceful shutdown hangs
    setTimeout(() => {
      console.error("[Bot] Forced exit after timeout");
      process.exit(1);
    }, 30_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // A best-effort side feature (e.g. the Deepgram transcriber WebSocket) must
  // NEVER hard-crash the process and leave an unfinalized recording. Route any
  // uncaught error through the same graceful shutdown so the webm is closed
  // cleanly instead of corrupting (the duration=N/A failure we hit).
  let shuttingDown = false;
  const guardedShutdown = (label: string, err: unknown) => {
    console.error(`[Bot] ${label}:`, err instanceof Error ? err.message : err);
    if (shuttingDown) return;
    shuttingDown = true;
    shutdown(label);
  };
  process.on("uncaughtException", (err) => guardedShutdown("uncaughtException", err));
  process.on("unhandledRejection", (reason) => guardedShutdown("unhandledRejection", reason));

  await bot.start();
};

main()
  .then(() => {
    console.log("[Bot] Finished successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Bot] Fatal error:", err.message);
    process.exit(1);
  });
