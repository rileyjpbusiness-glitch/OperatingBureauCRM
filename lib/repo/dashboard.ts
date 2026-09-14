import { and, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contacts, deals } from "@/lib/db/schema";

import { listDealsNeedingAttention } from "./deals";
import { monthlyRecurringCents } from "./money";
import { touchTotalsSince } from "./touches";
import type { DealCard } from "./types";

export type Dashboard = {
  newLeadsThisWeek: number;
  followUpsDueToday: number;
  callsBookedThisWeek: number;
  openPipelineMrrCents: number;
  needsAttention: DealCard[];
};

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getDashboard(now = new Date()): Promise<Dashboard> {
  const dayStart = startOfToday(now);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
  const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);

  const newLeads = db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(gte(contacts.createdAt, weekStart))
    .get();

  const dueToday = db
    .select({ count: sql<number>`count(*)` })
    .from(deals)
    .where(
      and(
        eq(deals.status, "open"),
        gte(deals.nextActionAt, dayStart),
        lte(deals.nextActionAt, dayEnd),
      ),
    )
    .get();

  // Read off the touch log rather than a stage name, so renaming a column on
  // the board cannot silently zero this tile.
  const touches = await touchTotalsSince(weekStart);

  const openDeals = db
    .select({ value: deals.value, valueType: deals.valueType })
    .from(deals)
    .where(eq(deals.status, "open"))
    .all();

  const openPipelineMrrCents = openDeals.reduce(
    (total, deal) => total + monthlyRecurringCents(deal.value, deal.valueType),
    0,
  );

  const attention = await listDealsNeedingAttention({ now, limit: 50 });
  const seen = new Set<string>();
  const needsAttention = [...attention.overdue, ...attention.stale].filter(
    (card) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    },
  );

  return {
    newLeadsThisWeek: newLeads?.count ?? 0,
    followUpsDueToday: dueToday?.count ?? 0,
    callsBookedThisWeek: touches.booked,
    openPipelineMrrCents,
    needsAttention,
  };
}
