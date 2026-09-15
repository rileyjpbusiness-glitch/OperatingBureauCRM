import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { lastDays, thisWeek } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { activities, deals, stages } from "@/lib/db/schema";

import { listDealsNeedingAttention } from "./deals";
import { notBinned } from "./filters";
import { monthlyRecurringCents } from "./money";
import { touchTotalsSince } from "./touches";
import type { DealCard } from "./types";

export type Dashboard = {
  touchesThisWeek: number;
  /** Overdue and due today together: both are owed now. */
  followUpsDue: number;
  callsBookedThisWeek: number;
  /** Null until at least one deal has reached the closing stage in the window. */
  closeRate: { rate: number | null; won: number; reached: number };
  openPipelineMrrCents: number;
  needsAttention: DealCard[];
};

/**
 * Of the deals that got as far as the closing stage in the last thirty days,
 * how many were won.
 *
 * Read off the activity log exactly as the column headers read conversion: a
 * deal that reached Won counts as having reached Closing, so winning one can
 * never make the rate look worse than not having the conversation at all.
 */
async function closeRateOverWindow(
  now: Date,
): Promise<{ rate: number | null; won: number; reached: number }> {
  const window = lastDays(now, 30);

  const all = db.select().from(stages).all();
  const wonIds: string[] = [];
  const closingIds: string[] = [];

  const pipelineIds = [...new Set(all.map((stage) => stage.pipelineId))];
  for (const pipelineId of pipelineIds) {
    const funnel = all
      .filter((stage) => stage.pipelineId === pipelineId && !stage.isLost)
      .sort((a, b) => a.position - b.position);

    const wonIndex = funnel.findIndex((stage) => stage.isWon);
    if (wonIndex < 1) continue;

    const won = funnel[wonIndex];
    const closing = funnel[wonIndex - 1];
    if (won) wonIds.push(won.id);
    if (closing) closingIds.push(closing.id);
  }

  if (wonIds.length === 0 || closingIds.length === 0) {
    return { rate: null, won: 0, reached: 0 };
  }

  const rows = db
    .selectDistinct({
      dealId: activities.dealId,
      stageId: sql<string>`${activities.toStageId}`,
    })
    .from(activities)
    .where(
      and(
        gte(activities.createdAt, window.start),
        lte(activities.createdAt, window.end),
        inArray(activities.toStageId, [...wonIds, ...closingIds]),
      ),
    )
    .all();

  const wonSet = new Set<string>();
  const reachedSet = new Set<string>();
  for (const row of rows) {
    reachedSet.add(row.dealId);
    if (wonIds.includes(row.stageId)) wonSet.add(row.dealId);
  }

  return {
    rate: reachedSet.size === 0 ? null : wonSet.size / reachedSet.size,
    won: wonSet.size,
    reached: reachedSet.size,
  };
}

export async function getDashboard(now = new Date()): Promise<Dashboard> {
  // Day and week boundaries come from date-fns rather than millisecond
  // arithmetic, so a clock change cannot shift a window by an hour and drop
  // something logged near midnight.
  const week = thisWeek(now);

  const dueRow = db
    .select({ count: sql<number>`count(*)` })
    .from(deals)
    .where(
      and(
        notBinned(),
        eq(deals.status, "open"),
        // No lower bound: a follow-up that was due last Tuesday is still due.
        lte(deals.nextActionAt, week.end),
      ),
    )
    .get();

  const touches = await touchTotalsSince(week.start);
  const closeRate = await closeRateOverWindow(now);

  const openDeals = db
    .select({ value: deals.value, valueType: deals.valueType })
    .from(deals)
    .where(and(notBinned(), eq(deals.status, "open")))
    .all();

  const openPipelineMrrCents = openDeals.reduce(
    (total, deal) => total + monthlyRecurringCents(deal.value, deal.valueType),
    0,
  );

  const attention = await listDealsNeedingAttention({ now, limit: 100 });
  const seen = new Set<string>();
  const needsAttention = [...attention.overdue, ...attention.stale].filter(
    (card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    },
  );

  return {
    touchesThisWeek: touches.total,
    followUpsDue: dueRow?.count ?? 0,
    callsBookedThisWeek: touches.booked,
    closeRate,
    openPipelineMrrCents,
    needsAttention,
  };
}
