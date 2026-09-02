import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { meetings, users } from "../../platform/db/schema";
import { meetQueue } from "../../platform/queues";
import { ForbiddenError } from "../../platform/utils/AppError";
import { meetingLimitFor } from "./plan";

export interface MeetingUsage {
  used: number;
  limit: number | null;
}

const RESERVED_JOB_STATES = ["active", "waiting", "delayed", "prioritized"] as const;

async function reservedBotJobs(ownerId: string): Promise<number> {
  const jobs = await meetQueue.getJobs([...RESERVED_JOB_STATES], 0, 500);
  return jobs.filter((job) => job.data.ownerId === ownerId).length;
}

export async function meetingUsage(ownerId: string): Promise<MeetingUsage> {
  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, ownerId));
  const limit = meetingLimitFor(user?.plan ?? "free");
  if (limit === null) return { used: 0, limit: null };

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meetings)
    .where(and(eq(meetings.ownerId, ownerId), ne(meetings.status, "failed")));
  const used = (row?.count ?? 0) + (await reservedBotJobs(ownerId));
  return { used, limit };
}

export function remainingMeetings(usage: MeetingUsage): number | null {
  return usage.limit === null ? null : Math.max(0, usage.limit - usage.used);
}

export async function assertMeetingQuota(ownerId: string, wanted = 1): Promise<void> {
  const usage = await meetingUsage(ownerId);
  const remaining = remainingMeetings(usage);
  if (remaining === null || remaining >= wanted) return;
  const noun = usage.limit === 1 ? "meeting" : "meetings";
  throw new ForbiddenError(
    `You've used your ${usage.limit} free ${noun}.`,
    "quota_exhausted"
  );
}
