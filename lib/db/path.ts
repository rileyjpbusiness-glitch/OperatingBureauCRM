import path from "node:path";

/**
 * The SQLite file lives at <repo>/data/bureau.db. `data/` is gitignored so the
 * database never leaves the machine it was created on. Override with
 * BUREAU_DB_PATH if you want a scratch copy.
 */
export const DB_PATH =
  process.env.BUREAU_DB_PATH ?? path.join(process.cwd(), "data", "bureau.db");

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");
