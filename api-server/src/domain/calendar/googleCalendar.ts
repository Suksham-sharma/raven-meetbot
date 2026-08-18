import systemConfig from "../../platform/config";
import type { GoogleCalendarEvent } from "./rules";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface UserInfo {
  email: string;
}

interface EventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
  }
}

function requireOauthConfig(): void {
  if (
    !systemConfig.GOOGLE_CLIENT_ID ||
    !systemConfig.GOOGLE_CLIENT_SECRET ||
    !systemConfig.GOOGLE_REDIRECT_URI
  ) {
    throw new Error("Google Calendar OAuth is not configured");
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = body as { error?: string | { message?: string }; error_description?: string };
    const code = typeof payload.error === "string" ? payload.error : undefined;
    const message =
      payload.error_description ||
      (typeof payload.error === "object" ? payload.error.message : undefined) ||
      `Google request failed with ${response.status}`;
    throw new GoogleCalendarError(message, response.status, code);
  }
  return body as T;
}

export function googleAuthorizationUrl(state: string): string {
  requireOauthConfig();
  const params = new URLSearchParams({
    client_id: systemConfig.GOOGLE_CLIENT_ID,
    redirect_uri: systemConfig.GOOGLE_REDIRECT_URI,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: [
      "openid",
      "email",
      "https://www.googleapis.com/auth/calendar.readonly",
    ].join(" "),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  requireOauthConfig();
  return requestJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: systemConfig.GOOGLE_CLIENT_ID,
      client_secret: systemConfig.GOOGLE_CLIENT_SECRET,
      redirect_uri: systemConfig.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  requireOauthConfig();
  const token = await requestJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: systemConfig.GOOGLE_CLIENT_ID,
      client_secret: systemConfig.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  return token.access_token;
}

export function fetchGoogleUser(accessToken: string): Promise<UserInfo> {
  return requestJson<UserInfo>("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  from: Date,
  to: Date
): Promise<GoogleCalendarEvent[]> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      showDeleted: "true",
      orderBy: "startTime",
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults: "2500",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await requestJson<EventsResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const response = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }
  );
  if (!response.ok && response.status !== 400) {
    throw new GoogleCalendarError("Google token revocation failed", response.status);
  }
}
