import { createRemoteJWKSet, jwtVerify } from "jose";
import systemConfig from "../config";
import {
  exchangeAuthorizationCode,
  googleAuthorizationUrl,
} from "../google/oauth";

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export function signInAuthorizationUrl(state: string): string {
  return googleAuthorizationUrl({
    redirectUri: systemConfig.GOOGLE_SIGNIN_REDIRECT_URI,
    scopes: ["openid", "email", "profile"],
    state,
  });
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience: systemConfig.GOOGLE_CLIENT_ID,
  });
  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("Google id token is missing the subject or email");
  }
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
  };
}

export async function exchangeSignInCode(code: string): Promise<GoogleIdentity> {
  const token = await exchangeAuthorizationCode(code, systemConfig.GOOGLE_SIGNIN_REDIRECT_URI);
  if (!token.id_token) throw new Error("Google did not return an id token");
  return verifyGoogleIdToken(token.id_token);
}
