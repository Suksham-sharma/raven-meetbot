import { Router } from "express";
import { joinMeet } from "../controllers/meet.controller";

const apiRouter = Router();
apiRouter.post("/join-meet", joinMeet);

export default apiRouter;
