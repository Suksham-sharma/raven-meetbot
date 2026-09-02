import systemConfig from "../../platform/config";
import {
  exchangeAuthorizationCode,
  googleAuthorizationUrl as authorizationUrl,
  refreshAccessToken,
  requestGoogleJson,
  revokeToken,
  type TokenResponse,
} from "../../platform/google/oauth";
import type { GoogleCalendarEvent } from "./rules";

interface UserInfo {
  email: string;
}

interface EventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

export function googleAuthorizationUrl(state: string, loginHint?: string): string {
  return authorizationUrl({
    redirectUri: systemConfig.GOOGLE_REDIRECT_URI,
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"],
    state,
    offline: true,
    loginHint,
  });
}

export function exchangeGoogleCode(code: string): Promise<TokenResponse> {
  return exchangeAuthorizationCode(code, systemConfig.GOOGLE_REDIRECT_URI);
}

export const refreshGoogleAccessToken = refreshAccessToken;
export const revokeGoogleToken = revokeToken;

export function fetchGoogleUser(accessToken: string): Promise<UserInfo> {
  return requestGoogleJson<UserInfo>("https://www.googleapis.com/oauth2/v2/userinfo", {
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
    const page = await requestGoogleJson<EventsResponse>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { authorization: `Bearer ${accessToken}` } }
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}
