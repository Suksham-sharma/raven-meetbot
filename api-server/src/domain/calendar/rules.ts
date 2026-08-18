import { createHash } from "crypto";

export interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
  conferenceData?: {
    conferenceSolution?: { key?: { type?: string } };
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
}

export interface SchedulableEvent {
  eventId: string;
  title: string | null;
  meetUrl: string;
  startsAt: Date;
  endsAt: Date | null;
}

const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#].*)?$/i;

export function extractMeetLink(event: GoogleCalendarEvent): string | null {
  const candidates = [
    event.hangoutLink,
    ...(event.conferenceData?.entryPoints ?? [])
      .filter((entry) => !entry.entryPointType || entry.entryPointType === "video")
      .map((entry) => entry.uri),
  ];
  return candidates.find((value): value is string => Boolean(value && MEET_URL.test(value))) ?? null;
}

export function toSchedulableEvent(event: GoogleCalendarEvent): SchedulableEvent | null {
  if (!event.id || event.status === "cancelled" || !event.start?.dateTime) return null;
  const self = event.attendees?.find((attendee) => attendee.self);
  if (self?.responseStatus === "declined") return null;
  const meetUrl = extractMeetLink(event);
  if (!meetUrl) return null;
  const startsAt = new Date(event.start.dateTime);
  if (Number.isNaN(startsAt.getTime())) return null;
  const endsAt = event.end?.dateTime ? new Date(event.end.dateTime) : null;
  return {
    eventId: event.id,
    title: event.summary?.trim() || null,
    meetUrl,
    startsAt,
    endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
  };
}

export function calendarJobId(
  ownerId: string,
  eventId: string,
  startsAt: Date
): string {
  const digest = createHash("sha256")
    .update(`${ownerId}\u0000${eventId}\u0000${startsAt.toISOString()}`)
    .digest("base64url")
    .slice(0, 32);
  return `cal-${digest}`;
}

export function occurrenceKey(eventId: string, startsAt: Date): string {
  return `${eventId}\u0000${startsAt.toISOString()}`;
}
