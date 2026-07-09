import { Router } from "express";
import { joinMeet } from "../controllers/meet.controller";
import { getBotStatus, listBots } from "../controllers/bot.controller";
import { askQuestion } from "../controllers/ask.controller";
import {
  approveAction,
  listMeetingActions,
  rejectAction,
} from "../controllers/actions.controller";

const apiRouter = Router();
apiRouter.post("/join-meet", joinMeet);
apiRouter.get("/bots/:jobId/status", getBotStatus);
apiRouter.get("/bots", listBots);
apiRouter.post("/ask", askQuestion);
apiRouter.get("/meetings/:id/actions", listMeetingActions);
apiRouter.post("/actions/:id/approve", approveAction);
apiRouter.post("/actions/:id/reject", rejectAction);

export default apiRouter;
