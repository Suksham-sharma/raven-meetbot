import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { users } from "../../platform/db/schema";
import { hashPassword, verifyPassword } from "../../platform/auth/password";
import { signToken } from "../../platform/auth/jwt";
import systemConfig from "../../platform/config/index";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../../platform/utils/AppError";
import { asyncHandler } from "../../platform/utils/asyncHandler";

const COOKIE = "token";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

export const login = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || !password) throw new BadRequestError("email and password are required");

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new UnauthorizedError("invalid email or password");
  }

  const token = await signToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token);
  res.status(200).json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

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

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.status(200).json({ ok: true });
});
