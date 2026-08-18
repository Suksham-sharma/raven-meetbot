import { describe, expect, it } from "vitest";
import {
  calendarJobId,
  extractMeetLink,
  toSchedulableEvent,
} from "./rules";

describe("calendar rules", () => {
  it("extracts Meet links from supported Google fields", () => {
    expect(
      extractMeetLink({ hangoutLink: "https://meet.google.com/abc-defg-hij" })
    ).toBe("https://meet.google.com/abc-defg-hij");
    expect(
      extractMeetLink({
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+10000000000" },
            { entryPointType: "video", uri: "https://meet.google.com/klm-nopq-rst" },
          ],
        },
      })
    ).toBe("https://meet.google.com/klm-nopq-rst");
  });

  it("rejects loose location-style values", () => {
    expect(extractMeetLink({ hangoutLink: "Meeting Room 3" })).toBeNull();
    expect(extractMeetLink({ hangoutLink: "https://example.com/meet" })).toBeNull();
  });

  it("filters cancelled, declined, and all-day events", () => {
    const start = { dateTime: "2026-08-19T10:00:00.000Z" };
    const hangoutLink = "https://meet.google.com/abc-defg-hij";
    expect(toSchedulableEvent({ id: "a", status: "cancelled", start, hangoutLink })).toBeNull();
    expect(
      toSchedulableEvent({
        id: "a",
        start,
        hangoutLink,
        attendees: [{ self: true, responseStatus: "declined" }],
      })
    ).toBeNull();
    expect(
      toSchedulableEvent({ id: "a", start: { date: "2026-08-19" }, hangoutLink })
    ).toBeNull();
  });

  it("creates owner-scoped BullMQ-safe job ids", () => {
    const startsAt = new Date("2026-08-19T10:00:00.000Z");
    const first = calendarJobId("owner-a", "event-a", startsAt);
    expect(first).toMatch(/^cal-[A-Za-z0-9_-]{32}$/);
    expect(first).not.toContain(":");
    expect(calendarJobId("owner-a", "event-a", startsAt)).toBe(first);
    expect(calendarJobId("owner-b", "event-a", startsAt)).not.toBe(first);
  });
});
