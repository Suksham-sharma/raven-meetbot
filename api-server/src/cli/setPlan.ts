import { eq } from "drizzle-orm";
import { db, pool } from "../platform/db/client";
import { users } from "../platform/db/schema";
import { isPlan, PLANS } from "../domain/auth/plan";

async function main(): Promise<void> {
  const [rawEmail, plan] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !isPlan(plan)) {
    console.error(`usage: pnpm plan <email> <${PLANS.join("|")}>`);
    process.exit(1);
  }

  const [user] = await db
    .update(users)
    .set({ plan })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) {
    console.error(`no user with email ${email}`);
    process.exit(1);
  }
  console.log(`${email} is now on the ${plan} plan`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
