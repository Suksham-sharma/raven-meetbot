import express from "express";
import cors from "cors";
import apiRouter from "./api/routes/index";
import systemConfig from "./platform/config/index";
import { assertConfig } from "./platform/config/validate";
import { setupGracefulShutdown } from "./platform/utils/gracefulShutdown";

assertConfig();

const app = express();

app.use(express.json());
app.use(cors());
app.use("/api/v1", apiRouter);

const server = app.listen(systemConfig.PORT, () => {
  console.log(`[API] Server running on port ${systemConfig.PORT}`);
});

setupGracefulShutdown(server);
