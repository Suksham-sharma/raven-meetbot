import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import systemConfig from "../config/index";
import * as schema from "./schema";

export const pool = new Pool({ connectionString: systemConfig.DATABASE_URL });

pool.on("error", (err) => {
  console.error("[db] idle client dropped, pool will reconnect:", err.message);
});

export const db = drizzle(pool, { schema });
