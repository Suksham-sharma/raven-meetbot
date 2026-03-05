import { Router } from "express";
import { joinMeet } from "../controllers/meet.controller";
import { getBotStatus, listBots } from "../controllers/bot.controller";

const apiRouter = Router();
apiRouter.post("/join-meet", joinMeet);
apiRouter.get("/bots/:jobId/status", getBotStatus);
apiRouter.get("/bots", listBots);

export default apiRouter;
