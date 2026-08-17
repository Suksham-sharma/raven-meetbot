import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../../platform/auth/jwt";

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      if (part.slice(0, eq).trim() === "token") {
        return decodeURIComponent(part.slice(eq + 1).trim());
      }
    }
  }
  return null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = readToken(req);
    if (!token) {
      res.status(401).json({ statusCode: 401, message: "authentication required" });
      return;
    }
    const { userId } = await verifyToken(token);
    req.userId = userId;
    next();
  } catch {
    // Any verify failure (expired/tampered/wrong alg) is unauthenticated; don't leak which.
    res.status(401).json({ statusCode: 401, message: "invalid or expired token" });
  }
}
