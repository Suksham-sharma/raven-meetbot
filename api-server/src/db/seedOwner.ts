import { eq, isNull } from "drizzle-orm";
import { db, pool } from "./client";
import { meetings, users } from "./schema";
import { hashPassword } from "../auth/password";
import systemConfig from "../config";

// One-time backfill: create the default owner and attach every ownerless meeting
// to it, so data ingested before auth is visible to a real account. Idempotent,
// re-runnable.
//
// Run: pnpm seed:owner

async function main(): Promise<void> {
  const email = systemConfig.DEFAULT_USER_EMAIL.trim().toLowerCase();

  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashPassword(systemConfig.DEFAULT_USER_PASSWORD),
        name: systemConfig.DEFAULT_USER_NAME,
      })
      .returning();
    console.log(`created default user ${email} (${user.id})`);
  } else {
    console.log(`default user already exists: ${email} (${user.id})`);
  }

  const assigned = await db
    .update(meetings)
    .set({ ownerId: user.id })
    .where(isNull(meetings.ownerId))
    .returning({ id: meetings.id });
  console.log(`assigned ${assigned.length} ownerless meeting(s) to ${email}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
