/**
 * Opens a downloaded backup and says what is in it.
 *
 * A backup you have not opened is a file, not a backup. This runs SQLite's own
 * integrity check and counts the rows that matter, so the thing you keep has
 * been proven readable at the moment you took it rather than on the day you
 * need it.
 *
 *   npm run verify:backup -- backups/bureau-2026-09-15-1642.db
 */
import fs from "node:fs";

import Database from "better-sqlite3";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/verify-snapshot.ts <file>");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const db = new Database(file, { readonly: true });
try {
  const integrity = db.pragma("integrity_check", { simple: true });
  if (integrity !== "ok") {
    console.error(`FAILED integrity check: ${String(integrity)}`);
    process.exit(1);
  }

  const count = (table: string): number =>
    (db.prepare(`select count(*) c from ${table}`).get() as { c: number }).c;

  const stages = db
    .prepare(
      `select s.name, (select count(*) from deals d
         where d.stage_id = s.id and d.binned_at is null) n
       from stages s
       join pipelines p on p.id = s.pipeline_id
       where p.slug = 'outbound'
       order by s.position`,
    )
    .all() as { name: string; n: number }[];

  const size = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ${file}  ${size} KB  integrity ok`);
  console.log(
    `  ${count("contacts")} contacts, ${count("deals")} deals, ` +
      `${count("notes")} notes, ${count("activities")} activity rows`,
  );
  // Where everyone is, because that is the thing you would actually be
  // checking for after a restore.
  console.log(
    "  " + stages.map((stage) => `${stage.name} ${stage.n}`).join(" · "),
  );
} finally {
  db.close();
}
