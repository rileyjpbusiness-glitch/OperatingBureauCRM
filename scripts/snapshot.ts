/**
 * Writes a consistent single-file copy of the database next to it.
 *
 * Not a file copy. The app runs SQLite in WAL mode, so at any moment some
 * committed transactions live in bureau.db-wal rather than in bureau.db, and
 * copying the one file from a running machine can silently lose the most recent
 * work while looking like a clean backup. VACUUM INTO asks SQLite itself for a
 * snapshot, which folds the log in and needs no downtime.
 *
 *   npm run snapshot            # writes <db dir>/snapshot.db
 *   npm run snapshot -- /tmp/x  # or wherever
 */
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { DB_PATH } from "../lib/db/path";

function main(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No database at ${DB_PATH}`);
    process.exit(1);
  }

  const target =
    process.argv[2] ?? path.join(path.dirname(DB_PATH), "snapshot.db");

  // VACUUM INTO refuses to overwrite, which is the right default everywhere
  // except here, where the previous snapshot has already been collected.
  fs.rmSync(target, { force: true });

  const db = new Database(DB_PATH, { readonly: true });
  try {
    db.prepare("select 1").get();
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  const check = new Database(target, { readonly: true });
  try {
    const integrity = check.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") {
      console.error(`Snapshot failed its integrity check: ${String(integrity)}`);
      process.exit(1);
    }
    const counts = {
      contacts: check.prepare("select count(*) c from contacts").get() as { c: number },
      deals: check.prepare("select count(*) c from deals").get() as { c: number },
      activities: check.prepare("select count(*) c from activities").get() as { c: number },
    };
    // Printed so the backup script can put the numbers in front of you rather
    // than reporting that some bytes moved.
    console.log(
      `${target} ${fs.statSync(target).size} ${counts.contacts.c} ${counts.deals.c} ${counts.activities.c}`,
    );
  } finally {
    check.close();
  }
}

main();
