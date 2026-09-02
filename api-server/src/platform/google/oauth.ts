import systemConfig from "../config";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
  }
}

export function requireGoogleOauthConfig(): void {
  if (!systemConfig.GOOGLE_CLIENT_ID || !systemConfig.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured");
  }
}

export async function requestGoogleJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = body as {
      error?: string | { message?: string };
      error_description?: string;
    };
    const code = typeof payload.error === "string" ? payload.error : undefined;
    const message =
      payload.error_description ||
      (typeof payload.error === "object" ? payload.error.message : undefined) ||
      `Google request failed with ${response.status}`;
    throw new GoogleApiError(message, response.status, code);
  }
  return body as T;
}

export function googleAuthorizationUrl(options: {
  redirectUri: string;
  scopes: string[];
  state: string;
  offline?: boolean;
  loginHint?: string;
}): string {
  requireGoogleOauthConfig();
  const params = new URLSearchParams({
    client_id: systemConfig.GOOGLE_CLIENT_ID,
    redirect_uri: options.redirectUri,
    response_type: "code",
    state: options.state,
    scope: options.scopes.join(" "),
  });
  if (options.offline) {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  }
  if (options.loginHint) params.set("login_hint", options.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  requireGoogleOauthConfig();
  return requestGoogleJson<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: systemConfig.GOOGLE_CLIENT_ID,
      client_secret: systemConfig.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  requireGoogleOauthConfig();
  const token = await requestGoogleJson<TokenResponse>("https://oauth2.googleapis.com/token", {
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

export async function revokeToken(token: string): Promise<void> {
  const response = await fetch(
    `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }
  );
  if (!response.ok && response.status !== 400) {
    throw new GoogleApiError("Google token revocation failed", response.status);
  }
}
