import { db } from "@/lib/db/client";
import {
  activities,
  contactTags,
  contacts,
  deals,
  notes,
  pipelines,
  stages,
  tags,
  tasks,
  touches,
} from "@/lib/db/schema";

/**
 * Empties every table, leaving the schema and the file itself alone.
 *
 * Deleting the database file would be simpler, but a dev server holding the
 * old file open keeps reading the unlinked copy and quietly serves stale rows
 * until it is restarted. Emptying in place means `npm run seed` takes effect in
 * a browser that is already open.
 */
export async function resetDatabase(): Promise<void> {
  db.transaction((tx) => {
    // Children first, so the foreign keys never have to be switched off.
    tx.delete(contactTags).run();
    tx.delete(tasks).run();
    tx.delete(activities).run();
    tx.delete(touches).run();
    tx.delete(notes).run();
    tx.delete(deals).run();
    tx.delete(contacts).run();
    tx.delete(tags).run();
    tx.delete(stages).run();
    tx.delete(pipelines).run();
  });
}
