import { Router } from "express";
import { joinMeet } from "../controllers/meet.controller";
import { getBotStatus, listBots } from "../controllers/bot.controller";
import { askQuestion } from "../controllers/ask.controller";

const apiRouter = Router();
apiRouter.post("/join-meet", joinMeet);
apiRouter.get("/bots/:jobId/status", getBotStatus);
apiRouter.get("/bots", listBots);
apiRouter.post("/ask", askQuestion);

export default apiRouter;
