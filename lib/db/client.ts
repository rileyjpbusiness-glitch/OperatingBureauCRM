import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { DB_PATH, MIGRATIONS_DIR } from "./path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Next's dev server re-evaluates modules on every edit. Without a global
 * handle each reload would open another connection to the same file and leak
 * them until the process restarts.
 */
const globalForDb = globalThis as unknown as { bureauDb?: Db };

function open(): Db {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  // WAL lets the dashboard read while the board is writing.
  sqlite.pragma("journal_mode = WAL");
  // Off by default in SQLite, and every cascade in the schema depends on it.
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  // Idempotent, and it runs once per process because of the global above. A
  // fresh clone can go straight to `npm run dev` without a migrate step.
  if (fs.existsSync(MIGRATIONS_DIR)) {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  }

  return db;
}

export const db: Db = globalForDb.bureauDb ?? open();

if (process.env.NODE_ENV !== "production") {
  globalForDb.bureauDb = db;
}
