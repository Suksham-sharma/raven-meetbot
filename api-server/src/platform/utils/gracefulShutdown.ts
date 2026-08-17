import { Server } from "http";

function setupGracefulShutdown(server: Server) {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[API] Received ${signal}, shutting down...`);

    server.close((err) => {
      if (err) {
        console.error("[API] Error closing HTTP server:", err);
        process.exit(1);
      } else {
        console.log("[API] HTTP server closed.");
        process.exit(0);
      }
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export { setupGracefulShutdown };
