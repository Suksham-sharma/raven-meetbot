import { createHash, randomBytes } from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { Request, Response } from "express";
import { db } from "../../platform/db/client";
import {
  calendarAccounts,
  calendarOauthStates,
  calendarSchedules,
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
