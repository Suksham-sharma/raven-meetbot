import { Request, Response } from "express";
import { createHash, randomBytes } from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { calendarOauthStates, users } from "../../platform/db/schema";
import { hashPassword, verifyPassword } from "../../platform/auth/password";
import { signToken } from "../../platform/auth/jwt";
import {
  exchangeSignInCode,
  signInAuthorizationUrl,
} from "../../platform/auth/googleIdentity";
import systemConfig from "../../platform/config/index";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";
import { findOrCreateGoogleUser, type SessionUser } from "../../domain/auth/googleAccount";
import { planForEmail } from "../../domain/auth/plan";
import { meetingUsage } from "../../domain/auth/quota";

const COOKIE = "token";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = hashPassword("timing-parity-placeholder");
const SIGNIN_STATE_TTL_MS = 10 * 60 * 1000;

const SESSION_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  plan: users.plan,
};

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: systemConfig.COOKIE_SECURE,
    maxAge: systemConfig.JWT_MAX_AGE_MS,
    path: "/",
  });
}

async function sessionPayload(user: SessionUser) {
  return { user, usage: await meetingUsage(user.id) };
}

async function issueSession(res: Response, user: SessionUser) {
  const token = await signToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token);
  return { token, ...(await sessionPayload(user)) };
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("base64url");
}

function loginUrl(result: string): string {
  const url = new URL("/login", systemConfig.WEB_APP_URL);
  url.searchParams.set("google", result);
  return url.toString();
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const name = req.body?.name != null ? String(req.body.name).trim() : null;
  if (!EMAIL_RE.test(email)) throw new BadRequestError("a valid email is required");
  if (password.length < 8) throw new BadRequestError("password must be at least 8 characters");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new ConflictError("email already registered");

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash: hashPassword(password), name, plan: planForEmail(email) })
    .returning(SESSION_COLUMNS);

  res.status(201).json(await issueSession(res, user));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) throw new BadRequestError("email and password are required");

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !ok) {
    throw new UnauthorizedError("invalid email or password");
  }

  res.status(200).json(
    await issueSession(res, {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
    })
  );
});

export const googleSignIn = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  await db.delete(calendarOauthStates).where(lt(calendarOauthStates.expiresAt, now));
  const state = randomBytes(32).toString("base64url");
  await db.insert(calendarOauthStates).values({
    stateHash: hashState(state),
    purpose: "signin",
    ownerId: null,
    expiresAt: new Date(now.getTime() + SIGNIN_STATE_TTL_MS),
  });
  res.redirect(signInAuthorizationUrl(state));
});

export const googleSignInCallback = asyncHandler(async (req: Request, res: Response) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!state) throw new BadRequestError("OAuth state is required");
  const [stored] = await db
    .delete(calendarOauthStates)
    .where(
      and(
        eq(calendarOauthStates.stateHash, hashState(state)),
        eq(calendarOauthStates.purpose, "signin"),
        gt(calendarOauthStates.expiresAt, new Date())
      )
    )
    .returning({ stateHash: calendarOauthStates.stateHash });
  if (!stored) throw new BadRequestError("OAuth state is invalid or expired");

  if (req.query.error) {
    res.redirect(loginUrl("denied"));
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) throw new BadRequestError("OAuth code is required");

  const identity = await exchangeSignInCode(code);
  if (!identity.emailVerified) {
    res.redirect(loginUrl("unverified"));
    return;
  }

  const user = await findOrCreateGoogleUser(identity);
  await issueSession(res, user);
  res.redirect(systemConfig.WEB_APP_URL);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  const [user] = await db.select(SESSION_COLUMNS).from(users).where(eq(users.id, userId));
  if (!user) throw new UnauthorizedError("user not found");
  res.status(200).json(await sessionPayload(user));
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.status(200).json({ ok: true });
});
