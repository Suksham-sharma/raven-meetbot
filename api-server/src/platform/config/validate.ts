export const DEV_JWT_SECRET = "dev-insecure-secret-change-me-please-0123456789";

const PRODUCTION_REQUIRED = [
  "JWT_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "WEB_APP_URL",
] as const;

const GROUPS = [
  {
    name: "R2 object storage",
    keys: ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
  },
  {
    name: "Google Calendar",
    keys: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_REDIRECT_URI",
      "CALENDAR_TOKEN_KEY",
    ],
  },
  { name: "Linear", keys: ["LINEAR_API_KEY", "LINEAR_TEAM_ID"] },
] as const;

const POSITIVE_NUMBERS = [
  "PORT",
  "JWT_MAX_AGE_MS",
  "CALENDAR_LOOKAHEAD_HOURS",
  "CALENDAR_SYNC_INTERVAL_MS",
  "CALENDAR_JOIN_EARLY_MS",
  "CALENDAR_MAX_LATE_MS",
  "JOB_ATTEMPTS",
  "JOB_BACKOFF_MS",
] as const;

type Env = Record<string, string | undefined>;

function isSet(env: Env, key: string): boolean {
  const value = env[key];
  return typeof value === "string" && value.trim() !== "";
}

export function collectConfigErrors(env: Env = process.env): string[] {
  const errors: string[] = [];

  if (env.NODE_ENV === "production") {
    for (const key of PRODUCTION_REQUIRED) {
      if (!isSet(env, key)) {
        errors.push(`${key} must be set in production (it is falling back to a dev default)`);
      }
    }
    if (env.JWT_SECRET === DEV_JWT_SECRET) {
      errors.push("JWT_SECRET is still the committed dev value — tokens are forgeable");
    }
  }

  for (const group of GROUPS) {
    const present = group.keys.filter((key) => isSet(env, key));
    if (present.length === 0 || present.length === group.keys.length) continue;
    const missing = group.keys.filter((key) => !isSet(env, key));
    errors.push(
      `${group.name} is half-configured: ${present.join(", ")} set but ${missing.join(", ")} missing`
    );
  }

  if (isSet(env, "CALENDAR_TOKEN_KEY")) {
    const decoded = Buffer.from(env.CALENDAR_TOKEN_KEY as string, "base64");
    if (decoded.length !== 32) {
      errors.push(
        `CALENDAR_TOKEN_KEY must be a base64-encoded 32-byte key (decoded to ${decoded.length} bytes)`
      );
    }
  }

  for (const key of POSITIVE_NUMBERS) {
    if (!isSet(env, key)) continue;
    const parsed = Number(env[key]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${key}="${env[key]}" is not a positive number — it would silently fall back to a default`);
    }
  }

  return errors;
}

export function assertConfig(env: Env = process.env): void {
  const errors = collectConfigErrors(env);
  if (errors.length === 0) return;
  throw new Error(
    [`Invalid configuration (${errors.length}):`, ...errors.map((e) => `  - ${e}`)].join("\n")
  );
}
