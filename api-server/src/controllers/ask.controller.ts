import { Request, Response } from "express";
import { ask, askStream } from "../agent/ask";
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

// POST /api/v1/ask/stream — same as /ask but streams tool-call progress via SSE.
// Frontend uses fetch + ReadableStream (not EventSource) so it can POST with JWT.
export async function askStreamHandler(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const q = req.body?.q;
  if (!q || typeof q !== "string") {
    res.status(400).json({ message: "Body must include a string `q`" });
    return;
  }
  const meetingId = req.body?.meeting_id;
  if (meetingId != null && typeof meetingId !== "string") {
    res.status(400).json({ message: "`meeting_id` must be a string when present" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Paired with the client's 40s idle timeout: silence longer than this means
  // dead, not slow. Keep the two in step.
  let closed = false;
  const heartbeat = setInterval(() => {
    if (!closed) res.write(": ping\n\n");
  }, 15_000);

  // Stop the generator when nobody is listening; it bills per model turn.
  res.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
  });

  const write = (event: unknown) => {
    if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    for await (const event of askStream(q, userId, { meetingId })) {
      if (closed) break;
      if (event.type === "done") {
        const r = event.result;
        write({
          type: "done",
          answer: r.answer,
          citations: r.citations.map((c) => ({
            meetingId: c.meetingId,
            start_s: c.startS,
            end_s: c.endS,
            speaker: c.speaker,
            text: c.text,
            recordingUrl: c.recordingUrl,
          })),
          grounded: r.grounded,
          refused: r.refused,
          retrieved_meetings: r.retrievedMeetings,
          contexts: r.contexts,
          iterations: r.iterations,
        });
      } else {
        write(event);
      }
      // flush if available (compression middleware may buffer)
      const maybeFlush = (res as unknown as { flush?: () => void }).flush;
      if (typeof maybeFlush === "function") maybeFlush.call(res);
    }
  } catch (err) {
    console.error("[ask/stream]", err);
    const message = err instanceof Error ? err.message : "Stream failed";
    try {
      write({ type: "error", message });
    } catch {
      // client already gone
    }
  } finally {
    clearInterval(heartbeat);
    if (!closed) res.end();
  }
}
