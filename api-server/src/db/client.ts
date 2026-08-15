import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import systemConfig from "../config";
import * as schema from "./schema";

// Single shared pg pool + Drizzle client. Reused by the api-server (read APIs,
// /ask) AND the ingest worker (D1: the worker is a process in this codebase, not
// a separate service), so the schema and connection live in exactly one place.
export const pool = new Pool({ connectionString: systemConfig.DATABASE_URL });

// Required, not decorative: node kills the process on an unhandled pool 'error',
// so without this a Postgres restart takes the API server down with it.
pool.on("error", (err) => {
  console.error("[db] idle client dropped, pool will reconnect:", err.message);
});

export const db = drizzle(pool, { schema });
