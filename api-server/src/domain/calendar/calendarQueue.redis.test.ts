import { Queue } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarJobId } from "./rules";

const redisUrl = process.env.TEST_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("calendar queue integration", () => {
  const queue = new Queue("calendar-sync-test", {
    connection: { url: redisUrl! },
  });

  beforeAll(async () => {
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it("enqueues one delayed bot for repeated reconciliation", async () => {
    const startsAt = new Date(Date.now() + 60_000);
    const jobId = calendarJobId("owner-a", "event-a", startsAt);
    const options = { jobId, delay: 30_000 };
    const first = await queue.add("join-meet", { eventId: "event-a" }, options);
    const second = await queue.add("join-meet", { eventId: "event-a" }, options);
    expect(first.id).toBe(jobId);
    expect(second.id).toBe(jobId);
    expect(await queue.getJobCounts("delayed")).toEqual({ delayed: 1 });
  });
});
