import express from "express";
import cors from "cors";
import apiRouter from "./routes";
import systemConfig from "./config";
import { setupGracefulShutdown } from "./utils/gracefulShutdown";

const app = express();

app.use(express.json());
app.use(cors());
app.use("/api/v1", apiRouter);

const server = app.listen(systemConfig.PORT, () => {
  console.log(`[API] Server running on port ${systemConfig.PORT}`);
});

setupGracefulShutdown(server);
