import { Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import systemConfig from "../../platform/config/index";
import { db } from "../../platform/db/client";
import { agentActions, meetings } from "../../platform/db/schema";
import { getAdapter } from "../../domain/actions/registry";
import { AdapterConfigError } from "../../domain/actions/adapter";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";

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

function requireUserId(req: Request): string {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  return userId;
}

async function requireOwnedMeeting(meetingId: string, userId: string) {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.ownerId, userId)));
  if (!meeting) throw new NotFoundError(`meeting ${meetingId} not found`);
  return meeting;
}

async function assertActionOwned(
  meetingId: string,
  userId: string,
  actionId: number
): Promise<void> {
  const [meeting] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.ownerId, userId)));
  if (!meeting) throw new NotFoundError(`action ${actionId} not found`);
}

export const listMeetingActions = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const meetingId = String(req.params.id);
  const meeting = await requireOwnedMeeting(meetingId, userId);

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

export const approveAction = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new BadRequestError("action id must be an integer");

  const [action] = await db.select().from(agentActions).where(eq(agentActions.id, id));
  if (!action) throw new NotFoundError(`action ${id} not found`);
  await assertActionOwned(action.meetingId, userId, id);
  if (action.status !== "proposed" && action.status !== "failed") {
    throw new ConflictError(`action ${id} is ${action.status}, not approvable`);
  }

  const adapter = getAdapter(action.kind);
  if (!adapter) throw new ConflictError(`no adapter for kind ${action.kind}`);
  const invalid = adapter.validate(action.payload);
  if (invalid) throw new ConflictError(`payload invalid: ${invalid}`);

  // A missing credential is a setup gap, not a failed attempt. Catching it
  // inside execute() recorded `failed` on a row nothing had been tried for, and
  // burned the proposal into an error state the user could not act on.
  if (!adapter.configured()) {
    res.status(409).json({
      executed: false,
      reason: "not_connected",
      integration: action.kind,
      message: `${action.kind} is not connected`,
      action: serialize(action),
    });
    return;
  }

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
    res
      .status(status)
      .json({ executed: false, message, error: message, action: serialize(updated) });
  }
});

export const rejectAction = asyncHandler(async (req: Request, res: Response) => {
  const userId = requireUserId(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new BadRequestError("action id must be an integer");

  const [action] = await db.select().from(agentActions).where(eq(agentActions.id, id));
  if (!action) throw new NotFoundError(`action ${id} not found`);
  await assertActionOwned(action.meetingId, userId, id);
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
