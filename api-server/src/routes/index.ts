import { Router } from "express";
import { joinMeet } from "../controllers/meet.controller";
import { getBotStatus, listBots } from "../controllers/bot.controller";
import { askQuestion, askStreamHandler } from "../controllers/ask.controller";
import {
  approveAction,
  listMeetingActions,
  rejectAction,
} from "../controllers/actions.controller";
import {
  getMeeting,
  getMeetingRecording,
  getMeetingTranscript,
  listActionItems,
  listMeetings,
  setActionItemCompleted,
  streamMeetingPoster,
  streamMeetingRecording,
} from "../controllers/meetings.controller";
import { login, logout, me, register } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";

const apiRouter = Router();

// Public: no session required.
apiRouter.post("/auth/register", register);
apiRouter.post("/auth/login", login);
apiRouter.post("/auth/logout", logout);

// Everything below requires a valid session; requireAuth pins req.userId that
// controllers and the /ask agent use to scope every read to the caller.
apiRouter.use(requireAuth);

apiRouter.get("/auth/me", me);
apiRouter.post("/join-meet", joinMeet);
apiRouter.get("/bots/:jobId/status", getBotStatus);
apiRouter.get("/bots", listBots);
apiRouter.post("/ask", askQuestion);
apiRouter.post("/ask/stream", askStreamHandler);
apiRouter.get("/meetings", listMeetings);
apiRouter.get("/meetings/:id", getMeeting);
apiRouter.get("/meetings/:id/transcript", getMeetingTranscript);
apiRouter.get("/meetings/:id/recording", getMeetingRecording);
apiRouter.get("/meetings/:id/recording/stream", streamMeetingRecording);
apiRouter.get("/meetings/:id/recording/poster", streamMeetingPoster);
apiRouter.get("/meetings/:id/actions", listMeetingActions);
apiRouter.get("/action-items", listActionItems);
apiRouter.patch("/action-items/:id", setActionItemCompleted);
apiRouter.post("/actions/:id/approve", approveAction);
apiRouter.post("/actions/:id/reject", rejectAction);

export default apiRouter;
