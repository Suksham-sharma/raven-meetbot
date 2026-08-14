import { Request, Response } from "express";
import { ask } from "../agent/ask";
import { BadRequestError, UnauthorizedError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

// POST /api/v1/ask { q } → agentic answer + cited clips (PLAN §4). Scoped to the
// authenticated user: the agent only ever sees this caller's meetings.
export const askQuestion = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  const q = req.body?.q;
  if (!q || typeof q !== "string") throw new BadRequestError("Body must include a string `q`");

  // Optional: confine the answer to one meeting. Ownership still comes from
  // userId, so naming someone else's meeting scopes the agent to a meeting it
  // cannot read and gets a refusal, not a leak.
  const meetingId = req.body?.meeting_id;
  if (meetingId != null && typeof meetingId !== "string") {
    throw new BadRequestError("`meeting_id` must be a string when present");
  }

  const result = await ask(q, userId, { meetingId });

  res.status(200).json({
    answer: result.answer,
    citations: result.citations.map((c) => ({
      meetingId: c.meetingId,
      start_s: c.startS,
      end_s: c.endS,
      speaker: c.speaker,
      text: c.text,
      recordingUrl: c.recordingUrl,
    })),
    grounded: result.grounded,
    refused: result.refused,
    // retrieval context exposed for the eval harness (run_eval.py / Ragas).
    retrieved_meetings: result.retrievedMeetings,
    contexts: result.contexts,
    iterations: result.iterations,
  });
});
