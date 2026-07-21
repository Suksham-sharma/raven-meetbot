import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken } from "../auth/jwt";
import systemConfig from "../config";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

// Email + password auth issuing a JWT. The token is returned in the body (API/CLI
// callers) and set as an httpOnly cookie (browser, which can't safely hold a token
// in JS).

const COOKIE = "token";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Compared against when the email is unknown, so login pays the same scrypt cost
// either way — no timing side-channel to enumerate accounts.
const DUMMY_HASH = hashPassword("timing-parity-placeholder");

function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: systemConfig.COOKIE_SECURE,
    maxAge: systemConfig.JWT_MAX_AGE_MS,
    path: "/",
  });
}

// POST /api/v1/auth/register { email, password, name? }
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
    .values({ email, passwordHash: hashPassword(password), name })
    .returning({ id: users.id, email: users.email, name: users.name });

  const token = await signToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token);
  res.status(201).json({ token, user });
});

// POST /api/v1/auth/login { email, password }
export const login = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) throw new BadRequestError("email and password are required");

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Same error AND same time for unknown-email vs wrong-password (dummy hash on
  // the miss), so neither response nor latency enumerates accounts.
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new UnauthorizedError("invalid email or password");
  }

  const token = await signToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token);
  res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// GET /api/v1/auth/me  (behind requireAuth)
export const me = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new UnauthorizedError();
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new UnauthorizedError("user not found");
  res.status(200).json({ user });
});

// POST /api/v1/auth/logout — clears the cookie (JWTs are stateless; nothing to
// invalidate server-side).
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.status(200).json({ ok: true });
});
