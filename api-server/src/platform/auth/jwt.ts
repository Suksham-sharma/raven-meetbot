import { SignJWT, jwtVerify } from "jose";
import systemConfig from "../config/index";

const secret = new TextEncoder().encode(systemConfig.JWT_SECRET);
const ALG = "HS256";

export interface TokenPayload {
  userId: string;
  email: string;
}

export async function signToken(p: TokenPayload): Promise<string> {
  return new SignJWT({ email: p.email })
    .setProtectedHeader({ alg: ALG })
    .setSubject(p.userId)
    .setIssuedAt()
    .setExpirationTime(systemConfig.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
  if (!payload.sub) throw new Error("token missing subject");
  return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
}
