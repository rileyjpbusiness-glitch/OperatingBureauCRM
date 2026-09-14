import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { activities } from "@/lib/db/schema";

import { parseActivityMeta } from "./activity-log";
import type { Activity } from "./types";

/** Reverse-chronological feed for one deal. The table is append-only. */
export async function listActivities(dealId: string): Promise<Activity[]> {
  const rows = db
    .select()
    .from(activities)
    .where(eq(activities.dealId, dealId))
    .orderBy(desc(activities.createdAt))
    .all();

  return rows.map((row) => ({ ...row, meta: parseActivityMeta(row.meta) }));
}
