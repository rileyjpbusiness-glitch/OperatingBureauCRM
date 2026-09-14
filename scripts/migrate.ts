import { DB_PATH } from "../lib/db/path";

/**
 * Importing the client opens the database and applies any pending migrations.
 */
async function main(): Promise<void> {
  const { db } = await import("../lib/db/client");
  // Touch the handle so the import is not elided.
  void db;
  console.log(`Migrations applied. Database: ${DB_PATH}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
