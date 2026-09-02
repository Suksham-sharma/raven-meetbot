import systemConfig from "../../platform/config";

export const PLANS = ["free", "unlimited"] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

export function planForEmail(email: string): Plan {
  return systemConfig.UNLIMITED_EMAILS.includes(email.trim().toLowerCase())
    ? "unlimited"
    : "free";
}

export function meetingLimitFor(plan: string): number | null {
  return plan === "unlimited" ? null : systemConfig.FREE_MEETING_LIMIT;
}
