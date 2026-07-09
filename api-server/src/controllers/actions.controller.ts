import { Request, Response } from "express";
import { desc, eq } from "drizzle-orm";
import systemConfig from "../config";
import { db } from "../db/client";
import { agentActions, meetings } from "../db/schema";
import { getAdapter } from "../actions/registry";
import { AdapterConfigError } from "../actions/adapter";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

// v3 approval surface. Approve is the ONLY path that fires an external call;
// dry_run (per-request or the global AGENT_DRY_RUN) previews without executing.

function serialize(a: typeof agentActions.$inferSelect, recordingUrl?: string | null, offset = 0) {
  const clip =
    a.evidenceStartS != null && recordingUrl
      ? `${recordingUrl}#t=${a.evidenceStartS + offset}`
      : null;
  return {
    id: a.id,
    meeting_id: a.meetingId,
    kind: a.kind,
    title: a.title,
    payload: a.payload,
    reasoning: a.reasoning,
    status: a.status,
    result: a.result,
    evidence:
      a.evidenceQuote != null
        ? { quote: a.evidenceQuote, start_s: a.evidenceStartS, end_s: a.evidenceEndS, clip }
        : null,
    created_at: a.createdAt,
    executed_at: a.executedAt,
  };
}

// GET /api/v1/meetings/:id/actions
export const listMeetingActions = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = String(req.params.id);
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId));
  if (!meeting) throw new NotFoundError(`meeting ${meetingId} not found`);

  const rows = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.meetingId, meetingId))
    .orderBy(desc(agentActions.createdAt));

  res.status(200).json({
    meeting_id: meetingId,
    actions: rows.map((a) => serialize(a, meeting.recordingUrl, meeting.recordingOffsetS)),
  });
});

// POST /api/v1/actions/:id/approve { dry_run? }
export const approveAction = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new BadRequestError("action id must be an integer");

  const [action] = await db.select().from(agentActions).where(eq(agentActions.id, id));
  if (!action) throw new NotFoundError(`action ${id} not found`);
  if (action.status !== "proposed" && action.status !== "failed") {
    throw new ConflictError(`action ${id} is ${action.status}, not approvable`);
  }

  const adapter = getAdapter(action.kind);
  if (!adapter) throw new ConflictError(`no adapter for kind ${action.kind}`);
  const invalid = adapter.validate(action.payload);
  if (invalid) throw new ConflictError(`payload invalid: ${invalid}`);

  const dryRun = Boolean(req.body?.dry_run) || systemConfig.AGENT_DRY_RUN;
  if (dryRun) {
    res.status(200).json({
      executed: false,
      dry_run: true,
      would: adapter.describe(action.payload as never),
      configured: adapter.configured(),
      action: serialize(action),
    });
    return;
  }

  try {
    const result = await adapter.execute(action.payload as never);
    const [updated] = await db
      .update(agentActions)
      .set({
        status: "executed",
        result: { external_id: result.externalId ?? null, url: result.url ?? null, detail: result.detail ?? null },
        executedAt: new Date(),
      })
      .where(eq(agentActions.id, id))
      .returning();
    res.status(200).json({ executed: true, action: serialize(updated) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [updated] = await db
      .update(agentActions)
      .set({ status: "failed", result: { error: message } })
      .where(eq(agentActions.id, id))
      .returning();
    const status = err instanceof AdapterConfigError ? 409 : 502;
    res.status(status).json({ executed: false, error: message, action: serialize(updated) });
  }
});

// POST /api/v1/actions/:id/reject
export const rejectAction = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new BadRequestError("action id must be an integer");

  const [action] = await db.select().from(agentActions).where(eq(agentActions.id, id));
  if (!action) throw new NotFoundError(`action ${id} not found`);
  if (action.status !== "proposed" && action.status !== "failed") {
    throw new ConflictError(`action ${id} is ${action.status}, not rejectable`);
  }

  const [updated] = await db
    .update(agentActions)
    .set({ status: "rejected" })
    .where(eq(agentActions.id, id))
    .returning();
  res.status(200).json({ action: serialize(updated) });
});
