import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

// db.ts writes `meetings` with hand-written SQL, so a column rename in api-server
// would break this service at runtime instead of at compile time. This reads the
// migrations that own the table and asserts every column we touch still exists.

const MIGRATIONS = path.resolve(__dirname, "../../api-server/drizzle");

function meetingsColumns(): Set<string> {
  const cols = new Set<string>();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

  for (const f of files) {
    const sql = readFileSync(path.join(MIGRATIONS, f), "utf8");

    const create = sql.match(/CREATE TABLE "meetings" \(([\s\S]*?)\n\);/);
    if (create) {
      for (const line of create[1].split("\n")) {
        const m = line.match(/^\s*"([a-z_][a-z0-9_]*)"/);
        if (m) cols.add(m[1]);
      }
    }

    for (const m of sql.matchAll(/ALTER TABLE "meetings" ADD COLUMN "([a-z_][a-z0-9_]*)"/g)) {
      cols.add(m[1]);
    }
    for (const m of sql.matchAll(/ALTER TABLE "meetings" DROP COLUMN "([a-z_][a-z0-9_]*)"/g)) {
      cols.delete(m[1]);
    }
  }
  return cols;
}

function columnsUsedByDb(): string[] {
  const src = readFileSync(path.resolve(__dirname, "db.ts"), "utf8");
  const used = new Set<string>();
  for (const stmt of src.matchAll(/UPDATE meetings SET ([\s\S]*?)WHERE ([\s\S]*?)`/g)) {
    for (const m of `${stmt[1]} ${stmt[2]}`.matchAll(/([a-z_][a-z0-9_]*)\s*=/g)) used.add(m[1]);
  }
  return [...used];
}

describe("media-worker SQL matches the api-server migrations", () => {
  it("finds the meetings table in the migrations", () => {
    expect(meetingsColumns().size).toBeGreaterThan(5);
  });

  it("touches at least the columns both workers write", () => {
    expect(columnsUsedByDb().sort()).toEqual(
      ["id", "mp4_key", "poster_key", "status", "status_error"].sort()
    );
  });

  it("every column db.ts writes still exists", () => {
    const existing = meetingsColumns();
    for (const col of columnsUsedByDb()) {
      expect(existing, `media-worker/src/db.ts writes "${col}"`).toContain(col);
    }
  });
});
