import { Request, Response } from "express";
import { BadRequestError, UnauthorizedError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { hybridSearch } from "../search/hybridSearch";

export const plainSearch = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) throw new BadRequestError("q is required");
  const k = req.query.k ? Number(req.query.k) : 8;
  if (req.query.k && (!Number.isInteger(k) || k < 1 || k > 50)) throw new BadRequestError("k must be 1-50");
  const speaker = typeof req.query.speaker === "string" ? req.query.speaker.trim() : undefined;
  const meetingId = typeof req.query.meeting_id === "string" ? req.query.meeting_id.trim() : undefined;
  const meetingType = typeof req.query.type === "string" ? req.query.type.trim() : undefined;
  const participant = typeof req.query.participant === "string" ? req.query.participant.trim() : undefined;
  let from: Date | undefined;
  let to: Date | undefined;
  if (typeof req.query.from === "string") { const d = new Date(req.query.from); if (isNaN(d.getTime())) throw new BadRequestError("from must be ISO timestamp"); from = d; }
  if (typeof req.query.to === "string") { const d = new Date(req.query.to); if (isNaN(d.getTime())) throw new BadRequestError("to must be ISO timestamp"); to = d; }
  const hits = await hybridSearch(q, { k, filters: { ownerId: userId, meetingId, meetingType, participant, speaker, from, to } });
  res.status(200).json({
    query: q,
    hits: hits.map((h) => ({
      chunk_id: h.chunkId,
      meeting_id: h.meetingId,
      meeting_title: h.meetingTitle,
      meeting_type: h.meetingType,
      meeting_date: h.meetingDate?.toISOString() ?? null,
      seq: h.seq,
      speaker: h.speaker,
      text: h.text,
      start_s: h.startS,
      end_s: h.endS,
      recording_offset_s: h.recordingOffsetS,
      score: h.score,
    })),
  });
});
