import { eq } from "drizzle-orm";
import { db } from "../../platform/db/client";
import { users } from "../../platform/db/schema";
import type { GoogleIdentity } from "../../platform/auth/googleIdentity";
import { planForEmail } from "./plan";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
}

const SESSION_COLUMNS = {
  id: users.id,
  email: users.email,
  name: users.name,
  plan: users.plan,
};

export async function findOrCreateGoogleUser(identity: GoogleIdentity): Promise<SessionUser> {
  const [bySub] = await db
    .select(SESSION_COLUMNS)
    .from(users)
    .where(eq(users.googleSub, identity.sub));
  if (bySub) return bySub;

  const [byEmail] = await db
    .select(SESSION_COLUMNS)
    .from(users)
    .where(eq(users.email, identity.email));
  if (byEmail) {
    const [linked] = await db
      .update(users)
      .set({ googleSub: identity.sub, name: byEmail.name ?? identity.name })
      .where(eq(users.id, byEmail.id))
      .returning(SESSION_COLUMNS);
    return linked;
  }

  const [created] = await db
    .insert(users)
    .values({
      email: identity.email,
      googleSub: identity.sub,
      name: identity.name,
      plan: planForEmail(identity.email),
    })
    .returning(SESSION_COLUMNS);
  return created;
}
