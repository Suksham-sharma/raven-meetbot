import express from "express";
import cors from "cors";
import apiRouter from "./api/routes/index";
import systemConfig from "./platform/config/index";
import { setupGracefulShutdown } from "./platform/utils/gracefulShutdown";

// Never boot production on the committed dev JWT secret — a forgeable signing
// key is silent account takeover.
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

const app = express();

app.use(express.json());
app.use(cors());
app.use("/api/v1", apiRouter);

const server = app.listen(systemConfig.PORT, () => {
  console.log(`[API] Server running on port ${systemConfig.PORT}`);
});

setupGracefulShutdown(server);
