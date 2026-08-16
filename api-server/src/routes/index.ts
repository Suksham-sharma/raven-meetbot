import { Router } from "express";
import { joinMeet } from "../controllers/meet.controller";
import { getBotStatus, listBots, stopBot } from "../controllers/bot.controller";
import { askQuestion, askStreamHandler } from "../controllers/ask.controller";
import {
  approveAction,
  listMeetingActions,
  rejectAction,
} from "../controllers/actions.controller";
import {
  deleteMeeting,
  exportMeeting,
  getMeeting,
  getMeetingRecording,
  getMeetingTranscript,
  listActionItems,
  listMeetings,
  retryMeeting,
  setActionItemCompleted,
  streamMeetingPoster,
  streamMeetingRecording,
  updateMeeting,
} from "../controllers/meetings.controller";
import { plainSearch } from "../controllers/search.controller";
import { completeUpload, directUpload, presignBulkUpload, presignUpload } from "../controllers/upload.controller";
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
apiRouter.post("/bots/:jobId/stop", stopBot);
apiRouter.get("/bots/:jobId/status", getBotStatus);
apiRouter.get("/bots", listBots);
apiRouter.post("/ask", askQuestion);
apiRouter.post("/ask/stream", askStreamHandler);
apiRouter.get("/search", plainSearch);
apiRouter.get("/meetings", listMeetings);
apiRouter.get("/meetings/:id", getMeeting);
apiRouter.patch("/meetings/:id", updateMeeting);
apiRouter.delete("/meetings/:id", deleteMeeting);
apiRouter.get("/meetings/:id/export", exportMeeting);
apiRouter.get("/meetings/:id/transcript", getMeetingTranscript);
apiRouter.post("/meetings/:id/retry", retryMeeting);
apiRouter.get("/meetings/:id/recording", getMeetingRecording);
apiRouter.post("/meetings/upload/presign", presignUpload);
apiRouter.post("/meetings/bulk-upload/presign", presignBulkUpload);
apiRouter.put("/meetings/:id/upload", directUpload);
apiRouter.post("/meetings/:id/complete", completeUpload);
apiRouter.get("/meetings/:id/recording/stream", streamMeetingRecording);
apiRouter.get("/meetings/:id/recording/poster", streamMeetingPoster);
apiRouter.get("/meetings/:id/actions", listMeetingActions);
apiRouter.get("/action-items", listActionItems);
apiRouter.patch("/action-items/:id", setActionItemCompleted);
apiRouter.post("/actions/:id/approve", approveAction);
apiRouter.post("/actions/:id/reject", rejectAction);

export default apiRouter;
