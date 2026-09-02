import { createHash, randomBytes } from "crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import { Request, Response } from "express";
import { db } from "../../platform/db/client";
import {
  actionItems,
  calendarAccounts,
  calendarOauthStates,
  calendarSchedules,
  decisions,
  meetings,
} from "../../platform/db/schema";
import systemConfig from "../../platform/config";
import {
  decryptCalendarToken,
  encryptCalendarToken,
} from "../../platform/calendar/tokenCipher";
import {
  exchangeGoogleCode,
  fetchGoogleUser,
  googleAuthorizationUrl,
  revokeGoogleToken,
} from "../../domain/calendar/googleCalendar";
import {
  cancelOwnerSchedules,
  syncCalendarAccount,
} from "../../domain/calendar/reconcile";
import {
  BadRequestError,
  UnauthorizedError,
} from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";

const STATE_TTL_MS = 10 * 60 * 1000;
const RUNNING_GRACE_MS = 4 * 60 * 60 * 1000;

function requireOwnerId(req: Request): string {
  if (!req.userId) throw new UnauthorizedError();
  return req.userId;
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("base64url");
}

function integrationsUrl(result: string): string {
  const url = new URL("/settings/integrations", systemConfig.WEB_APP_URL);
  url.searchParams.set("calendar", result);
  return url.toString();
}

export const connectCalendar = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = requireOwnerId(req);
  const now = new Date();
  await db.delete(calendarOauthStates).where(lt(calendarOauthStates.expiresAt, now));
  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = googleAuthorizationUrl(state);
  await db.insert(calendarOauthStates).values({
    stateHash: hashState(state),
    ownerId,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });
  res.redirect(authorizationUrl);
});

export const googleCalendarCallback = asyncHandler(
  async (req: Request, res: Response) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!state) throw new BadRequestError("OAuth state is required");
    const [stored] = await db
      .delete(calendarOauthStates)
      .where(
        and(
          eq(calendarOauthStates.stateHash, hashState(state)),
          gt(calendarOauthStates.expiresAt, new Date())
        )
      )
      .returning({ ownerId: calendarOauthStates.ownerId });
    if (!stored) throw new BadRequestError("OAuth state is invalid or expired");

    if (req.query.error) {
      res.redirect(integrationsUrl("denied"));
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) throw new BadRequestError("OAuth code is required");

    const token = await exchangeGoogleCode(code);
    const profile = await fetchGoogleUser(token.access_token);
    if (!profile.email) throw new BadRequestError("Google account email is unavailable");

    const [existing] = await db
      .select({ refreshToken: calendarAccounts.refreshToken })
      .from(calendarAccounts)
      .where(eq(calendarAccounts.ownerId, stored.ownerId));
    const refreshToken = token.refresh_token
      ? encryptCalendarToken(token.refresh_token)
      : existing?.refreshToken;
    if (!refreshToken) {
      throw new BadRequestError("Google did not provide offline access");
    }

    const now = new Date();
    await db
      .insert(calendarAccounts)
      .values({
        ownerId: stored.ownerId,
        email: profile.email,
        refreshToken,
        status: "connected",
        lastError: null,
        connectedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: calendarAccounts.ownerId,
        set: {
          email: profile.email,
          refreshToken,
          status: "connected",
          lastError: null,
          connectedAt: now,
          updatedAt: now,
        },
      });
    res.redirect(integrationsUrl("connected"));
  }
);

export const getCalendar = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = requireOwnerId(req);
  const [account] = await db
    .select({
      email: calendarAccounts.email,
      mode: calendarAccounts.mode,
      status: calendarAccounts.status,
      lastCheckedAt: calendarAccounts.lastCheckedAt,
      lastError: calendarAccounts.lastError,
      connectedAt: calendarAccounts.connectedAt,
    })
    .from(calendarAccounts)
    .where(eq(calendarAccounts.ownerId, ownerId));
  res.status(200).json({ calendar: account ?? null });
});

const normalizeTitle = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// "Last time" is the most recent past meeting carrying the same title. The
// calendar propagates the event title onto the meeting it produces, so a
// recurring event's occurrences share one, and matching on it needs no
// recurrence handling. A one-off event simply has no previous instance.
async function lastTimeBrief(
  ownerId: string,
  title: string | null,
  before: Date
): Promise<{
  meeting_id: string;
  title: string | null;
  date: string | null;
  decisions: { text: string; speaker: string | null; start_s: number }[];
  open_actions: { text: string; owner: string | null; due: string | null }[];
} | null> {
  if (!title?.trim()) return null;
  const wanted = normalizeTitle(title);
  if (!wanted) return null;

  const past = await db
    .select({ id: meetings.id, title: meetings.title, startedAt: meetings.startedAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.ownerId, ownerId),
        eq(meetings.status, "ready"),
        lt(meetings.startedAt, before)
      )
    )
    .orderBy(desc(meetings.startedAt))
    .limit(50);

  const previous = past.find(
    (m) => m.title && normalizeTitle(m.title) === wanted
  );
  if (!previous) return null;

  const [decs, acts] = await Promise.all([
    db
      .select({
        text: decisions.text,
        speaker: decisions.speaker,
        startS: decisions.startS,
      })
      .from(decisions)
      .where(eq(decisions.meetingId, previous.id))
      .orderBy(asc(decisions.seq))
      .limit(5),
    db
      .select({
        text: actionItems.text,
        owner: actionItems.owner,
        due: actionItems.due,
      })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.meetingId, previous.id),
          isNull(actionItems.completedAt)
        )
      )
      .orderBy(asc(actionItems.seq))
      .limit(5),
  ]);

  if (decs.length === 0 && acts.length === 0) return null;

  return {
    meeting_id: previous.id,
    title: previous.title,
    date: previous.startedAt?.toISOString() ?? null,
    decisions: decs.map((d) => ({
      text: d.text,
      speaker: d.speaker,
      start_s: d.startS,
    })),
    open_actions: acts,
  };
}

export const getUpcomingMeetings = asyncHandler(
  async (req: Request, res: Response) => {
    const ownerId = requireOwnerId(req);
    const rows = await db
      .select({
        id: calendarSchedules.id,
        jobId: calendarSchedules.jobId,
        title: calendarSchedules.title,
        meetUrl: calendarSchedules.meetUrl,
        startsAt: calendarSchedules.occurrenceStart,
        endsAt: calendarSchedules.occurrenceEnd,
        status: calendarSchedules.status,
      })
      .from(calendarSchedules)
      .where(
        and(
          eq(calendarSchedules.ownerId, ownerId),
          inArray(calendarSchedules.status, [
            "scheduled",
            "running",
            "skipped",
          ]),
          gte(
            calendarSchedules.occurrenceStart,
            new Date(Date.now() - RUNNING_GRACE_MS)
          )
        )
      )
      .orderBy(asc(calendarSchedules.occurrenceStart))
      .limit(5);

    const briefs = await Promise.all(
      rows.map((r) => lastTimeBrief(ownerId, r.title, r.startsAt))
    );
    res.status(200).json({
      upcoming: rows.map((r, i) => ({ ...r, last_time: briefs[i] })),
    });
  }
);

export const updateCalendar = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = requireOwnerId(req);
  const mode = req.body?.mode;
  if (mode !== "manual" && mode !== "all") {
    throw new BadRequestError("mode must be manual or all");
  }
  const [account] = await db
    .update(calendarAccounts)
    .set({ mode, updatedAt: new Date() })
    .where(
      and(
        eq(calendarAccounts.ownerId, ownerId),
        eq(calendarAccounts.status, "connected")
      )
    )
    .returning({ mode: calendarAccounts.mode });
  if (!account) throw new BadRequestError("Google Calendar is not connected");
  if (mode === "manual") await cancelOwnerSchedules(ownerId);
  else await syncCalendarAccount(ownerId);
  res.status(200).json({ calendar: account });
});

export const disconnectCalendar = asyncHandler(
  async (req: Request, res: Response) => {
    const ownerId = requireOwnerId(req);
    const [account] = await db
      .select({ refreshToken: calendarAccounts.refreshToken })
      .from(calendarAccounts)
      .where(eq(calendarAccounts.ownerId, ownerId));
    if (account?.refreshToken) {
      const token = decryptCalendarToken(account.refreshToken);
      await revokeGoogleToken(token).catch(() => undefined);
    }
    await cancelOwnerSchedules(ownerId);
    await db
      .update(calendarAccounts)
      .set({
        refreshToken: null,
        mode: "manual",
        status: "disconnected",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(calendarAccounts.ownerId, ownerId));
    res.status(200).json({ ok: true });
  }
);

export const syncCalendar = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = requireOwnerId(req);
  await syncCalendarAccount(ownerId);
  const schedules = await db
    .select({
      id: calendarSchedules.id,
      title: calendarSchedules.title,
      occurrenceStart: calendarSchedules.occurrenceStart,
      status: calendarSchedules.status,
    })
    .from(calendarSchedules)
    .where(eq(calendarSchedules.ownerId, ownerId));
  res.status(200).json({ schedules });
});
