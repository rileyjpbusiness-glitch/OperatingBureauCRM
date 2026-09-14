import { and, eq, lte, sql } from "drizzle-orm";

import { thisWeek } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { deals } from "@/lib/db/schema";

import { listDealsNeedingAttention } from "./deals";
import { monthlyRecurringCents } from "./money";
import { touchTotalsSince } from "./touches";
import type { DealCard } from "./types";

export type Dashboard = {
  touchesThisWeek: number;
  /** Overdue and due today together: both are owed now. */
  followUpsDue: number;
  callsBookedThisWeek: number;
  openPipelineMrrCents: number;
  needsAttention: DealCard[];
};

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
        eq(deals.status, "open"),
        // No lower bound: a follow-up that was due last Tuesday is still due.
        lte(deals.nextActionAt, week.end),
      ),
    )
    .get();

  const touches = await touchTotalsSince(week.start);

  const openDeals = db
    .select({ value: deals.value, valueType: deals.valueType })
    .from(deals)
    .where(eq(deals.status, "open"))
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
    openPipelineMrrCents,
    needsAttention,
  };
}
