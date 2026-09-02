import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../platform/db/client";
import {
  calendarAccounts,
  calendarSchedules,
} from "../../platform/db/schema";
import systemConfig from "../../platform/config";
import { controlQueue, meetQueue } from "../../platform/queues";
import { decryptCalendarToken } from "../../platform/calendar/tokenCipher";
import { GoogleApiError } from "../../platform/google/oauth";
import { meetingUsage, remainingMeetings } from "../auth/quota";
import {
  listGoogleCalendarEvents,
  refreshGoogleAccessToken,
} from "./googleCalendar";
import {
  calendarJobId,
  occurrenceKey,
  toSchedulableEvent,
  type SchedulableEvent,
} from "./rules";

type CalendarAccount = typeof calendarAccounts.$inferSelect;

async function cancelJob(jobId: string): Promise<void> {
  const job = await meetQueue.getJob(jobId);
  if (!job) return;
  const state = await job.getState();
  if (state === "active") {
    await controlQueue.add(
      "stop",
      { jobId },
      { removeOnComplete: true, removeOnFail: true }
    );
    return;
  }
  if (state === "waiting" || state === "delayed" || state === "prioritized") {
    await job.remove();
  }
}

async function markScheduleState(id: number, status: string): Promise<void> {
  await db
    .update(calendarSchedules)
    .set({ status, updatedAt: new Date() })
    .where(eq(calendarSchedules.id, id));
}

async function ensureScheduled(
  account: CalendarAccount,
  event: SchedulableEvent,
  now: Date
): Promise<void> {
  const [existing] = await db
    .select()
    .from(calendarSchedules)
    .where(
      and(
        eq(calendarSchedules.ownerId, account.ownerId),
        eq(calendarSchedules.eventId, event.eventId),
        eq(calendarSchedules.occurrenceStart, event.startsAt)
      )
    );

  if (existing) {
    if (existing.status !== "scheduled" && existing.status !== "running") return;
    const job = await meetQueue.getJob(existing.jobId);
    if (!job) {
      await markScheduleState(existing.id, "failed");
      return;
    }
    const state = await job.getState();
    if (existing.meetUrl !== event.meetUrl || existing.title !== event.title) {
      await db
        .update(calendarSchedules)
        .set({
          meetUrl: event.meetUrl,
          title: event.title,
          occurrenceEnd: event.endsAt,
          updatedAt: new Date(),
        })
        .where(eq(calendarSchedules.id, existing.id));
      await job.updateData({
        ...job.data,
        url: event.meetUrl,
        title: event.title,
      });
    }
    if (state === "active" && existing.status !== "running") {
      await markScheduleState(existing.id, "running");
    } else if (state === "completed") {
      await markScheduleState(existing.id, "completed");
    } else if (state === "failed") {
      const status = job.failedReason?.includes("join window expired")
        ? "skipped_late"
        : "failed";
      await markScheduleState(existing.id, status);
    }
    return;
  }

  if (event.endsAt && event.endsAt <= now) return;
  if (now.getTime() - event.startsAt.getTime() > systemConfig.CALENDAR_MAX_LATE_MS) {
    return;
  }
  if (remainingMeetings(await meetingUsage(account.ownerId)) === 0) return;

  const jobId = calendarJobId(account.ownerId, event.eventId, event.startsAt);
  const [schedule] = await db
    .insert(calendarSchedules)
    .values({
      ownerId: account.ownerId,
      eventId: event.eventId,
      occurrenceStart: event.startsAt,
      occurrenceEnd: event.endsAt,
      title: event.title,
      meetUrl: event.meetUrl,
      jobId,
    })
    .returning({ id: calendarSchedules.id });

  const runAt = event.startsAt.getTime() - systemConfig.CALENDAR_JOIN_EARLY_MS;
  try {
    await meetQueue.add(
      "join-meet",
      {
        url: event.meetUrl,
        botName: "Shadow NoteTaker",
        maxDurationMinutes: null,
        ownerId: account.ownerId,
        title: event.title,
        scheduledStartMs: event.startsAt.getTime(),
        calendarScheduleId: schedule.id,
      },
      { jobId, delay: Math.max(0, runAt - now.getTime()) }
    );
  } catch (error) {
    await markScheduleState(schedule.id, "failed");
    throw error;
  }
}

export async function cancelOwnerSchedules(ownerId: string): Promise<void> {
  const rows = await db
    .select({ id: calendarSchedules.id, jobId: calendarSchedules.jobId })
    .from(calendarSchedules)
    .where(
      and(
        eq(calendarSchedules.ownerId, ownerId),
        inArray(calendarSchedules.status, ["scheduled", "running"])
      )
    );
  await Promise.all(rows.map((row) => cancelJob(row.jobId)));
  if (rows.length > 0) {
    await db
      .update(calendarSchedules)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(calendarSchedules.ownerId, ownerId),
          inArray(calendarSchedules.status, ["scheduled", "running"])
        )
      );
  }
}

async function reconcileEvents(
  account: CalendarAccount,
  events: SchedulableEvent[],
  from: Date,
  to: Date
): Promise<void> {
  const desired = new Set(
    events.map((event) => occurrenceKey(event.eventId, event.startsAt))
  );
  const current = await db
    .select()
    .from(calendarSchedules)
    .where(
      and(
        eq(calendarSchedules.ownerId, account.ownerId),
        gte(
          calendarSchedules.occurrenceStart,
          new Date(from.getTime() - 24 * 60 * 60 * 1000)
        ),
        lte(calendarSchedules.occurrenceStart, to),
        inArray(calendarSchedules.status, ["scheduled", "running"])
      )
    );

  const removed = current.filter(
    (schedule) =>
      !desired.has(occurrenceKey(schedule.eventId, schedule.occurrenceStart))
  );
  await Promise.all(removed.map((schedule) => cancelJob(schedule.jobId)));
  await Promise.all(
    removed.map((schedule) => markScheduleState(schedule.id, "cancelled"))
  );
  for (const event of events) {
    await ensureScheduled(account, event, from);
  }
}

async function markDisconnected(account: CalendarAccount, message: string): Promise<void> {
  await db
    .update(calendarAccounts)
    .set({
      status: "disconnected",
      refreshToken: null,
      lastError: message,
      updatedAt: new Date(),
    })
    .where(eq(calendarAccounts.ownerId, account.ownerId));
  await cancelOwnerSchedules(account.ownerId);
}

export async function syncCalendarAccount(ownerId: string): Promise<void> {
  const [account] = await db
    .select()
    .from(calendarAccounts)
    .where(eq(calendarAccounts.ownerId, ownerId));
  if (!account || account.status !== "connected") return;
  if (account.mode === "manual") {
    await cancelOwnerSchedules(ownerId);
    return;
  }
  if (!account.refreshToken) {
    await markDisconnected(account, "Google authorization is missing");
    return;
  }

  const from = new Date();
  const to = new Date(
    from.getTime() + systemConfig.CALENDAR_LOOKAHEAD_HOURS * 60 * 60 * 1000
  );
  try {
    const refreshToken = decryptCalendarToken(account.refreshToken);
    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const rawEvents = await listGoogleCalendarEvents(accessToken, from, to);
    const events = rawEvents
      .map(toSchedulableEvent)
      .filter((event): event is SchedulableEvent => event !== null);
    await reconcileEvents(account, events, from, to);
    await db
      .update(calendarAccounts)
      .set({ lastCheckedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(calendarAccounts.ownerId, ownerId));
  } catch (error) {
    if (
      error instanceof GoogleApiError &&
      error.status === 400 &&
      error.code === "invalid_grant"
    ) {
      await markDisconnected(account, "Google authorization ended");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(calendarAccounts)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(calendarAccounts.ownerId, ownerId));
    throw error;
  }
}

export async function syncAllCalendarAccounts(): Promise<void> {
  const accounts = await db
    .select({ ownerId: calendarAccounts.ownerId })
    .from(calendarAccounts)
    .where(eq(calendarAccounts.status, "connected"));
  for (const account of accounts) {
    await syncCalendarAccount(account.ownerId).catch((error) => {
      console.error(`[calendar] sync failed for ${account.ownerId}:`, error);
    });
  }
}
