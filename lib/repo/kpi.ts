import { and, eq, gte, inArray } from "drizzle-orm";

import {
  endOfDay,
  formatDayLabel,
  formatMonthLabel,

  startOfDaysAgo,
  startOfMonthsAgo,
} from "@/lib/dates";
import { db } from "@/lib/db/client";
import {
  KPI_METRICS,
  type ChartBucket,
  type KpiMetric,
  type KpiReading,
  type Period,
} from "@/lib/kpi";
import { activities, contacts, deals, stages } from "@/lib/db/schema";

import { getBoard } from "./board";
import { monthlyRecurringCents } from "./money";
import { notBinned } from "./filters";
import type { StageWithMetrics } from "./types";

// Re-exported so server callers have one import for the whole subject.
export * from "@/lib/kpi";

/**
 * Every period is a trailing window, and the comparison is the window of the
 * same length immediately before it. Calendar months would make "vs last month"
 * meaningless on the 2nd.
 */
const PERIOD_DAYS: Record<Period, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  annually: 365,
};

/** How the performance chart is cut up at each period. */
const CHART_BUCKETS: Record<Period, { count: number; unit: "day" | "month" }> = {
  daily: { count: 14, unit: "day" },
  weekly: { count: 14, unit: "day" },
  monthly: { count: 30, unit: "day" },
  annually: { count: 12, unit: "month" },
};

export type KpiDashboard = {
  period: Period;
  readings: Record<KpiMetric, KpiReading>;
  series: ChartBucket[];
  stages: StageWithMetrics[];
  /** Open deals across the whole pipeline, for the stage shares. */
  openTotal: number;
};

function windowFor(
  now: Date,
  period: Period,
  back: number,
): { start: Date; end: Date } {
  const days = PERIOD_DAYS[period];
  const offset = days * back;
  return {
    start: startOfDaysAgo(now, days - 1 + offset),
    end:
      back === 0
        ? endOfDay(now)
        : new Date(startOfDaysAgo(now, offset).getTime() - 1),
  };
}

function bucketsFor(now: Date, period: Period): { start: Date; end: Date; label: string }[] {
  const { count, unit } = CHART_BUCKETS[period];

  if (unit === "month") {
    return Array.from({ length: count }, (_, index) => {
      const back = count - 1 - index;
      const start = startOfMonthsAgo(now, back);
      const end = new Date(startOfMonthsAgo(now, back - 1).getTime() - 1);
      return { start, end, label: formatMonthLabel(start) };
    });
  }

  return Array.from({ length: count }, (_, index) => {
    const back = count - 1 - index;
    const start = startOfDaysAgo(now, back);
    return {
      start,
      end: new Date(startOfDaysAgo(now, back - 1).getTime() - 1),
      label: formatDayLabel(start),
    };
  });
}

type WonRow = { dealId: string; at: Date; mrrCents: number };

/** The closing stage of every pipeline that has one, for the conversion rate. */
function closingStageIds(): string[] {
  const all = db.select().from(stages).all();
  const ids: string[] = [];

  for (const pipelineId of new Set(all.map((stage) => stage.pipelineId))) {
    const funnel = all
      .filter((stage) => stage.pipelineId === pipelineId && !stage.isLost)
      .sort((a, b) => a.position - b.position);
    const wonIndex = funnel.findIndex((stage) => stage.isWon);
    const closing = wonIndex > 0 ? funnel[wonIndex - 1] : undefined;
    if (closing) ids.push(closing.id);
  }
  return ids;
}

function wonStageIds(): string[] {
  return db
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.isWon, true))
    .all()
    .map((row) => row.id);
}

export async function getKpiDashboard(
  period: Period,
  now = new Date(),
): Promise<KpiDashboard> {
  const buckets = bucketsFor(now, period);
  const current = windowFor(now, period, 0);
  const previous = windowFor(now, period, 1);

  // One fetch covering the chart and both comparison windows, then bucketed in
  // memory: thirty buckets is not thirty round trips.
  const firstBucket = buckets[0];
  const rangeStart = new Date(
    Math.min(
      firstBucket ? firstBucket.start.getTime() : previous.start.getTime(),
      previous.start.getTime(),
    ),
  );

  // A lead is a contact you are actually working, so one whose every deal has
  // been binned stops counting. Without this, binning a lead would leave the
  // Leads tile reporting it forever.
  const leadRows = db
    .selectDistinct({ at: contacts.createdAt })
    .from(contacts)
    .innerJoin(deals, eq(deals.contactId, contacts.id))
    .where(and(notBinned(), gte(contacts.createdAt, rangeStart)))
    .all();

  const won = wonStageIds();
  const closing = closingStageIds();

  const wonRows: WonRow[] =
    won.length === 0
      ? []
      : db
          .select({
            dealId: activities.dealId,
            at: activities.createdAt,
            value: deals.value,
            valueType: deals.valueType,
          })
          .from(activities)
          .innerJoin(deals, eq(deals.id, activities.dealId))
          .where(
            and(
              notBinned(),
              eq(activities.type, "won"),
              gte(activities.createdAt, rangeStart),
            ),
          )
          .all()
          .map((row) => ({
            dealId: row.dealId,
            at: row.at,
            mrrCents: monthlyRecurringCents(row.value, row.valueType),
          }));

  const reachedRows =
    closing.length === 0
      ? []
      : db
          .selectDistinct({
            dealId: activities.dealId,
            at: activities.createdAt,
          })
          .from(activities)
          // Joined only so a binned deal's history stops counting; nothing is
          // selected from it.
          .innerJoin(deals, eq(deals.id, activities.dealId))
          .where(
            and(
              notBinned(),
              inArray(activities.toStageId, [...closing, ...won]),
              gte(activities.createdAt, rangeStart),
            ),
          )
          .all();

  const within = (at: Date, range: { start: Date; end: Date }) =>
    at.getTime() >= range.start.getTime() && at.getTime() <= range.end.getTime();

  function measure(range: { start: Date; end: Date }): Record<KpiMetric, number> {
    const leads = leadRows.filter((row) => within(row.at, range)).length;

    const wonInRange = wonRows.filter((row) => within(row.at, range));
    const closed = new Set(wonInRange.map((row) => row.dealId)).size;
    const revenue = wonInRange.reduce((total, row) => total + row.mrrCents, 0);

    const reached = new Set(
      reachedRows.filter((row) => within(row.at, range)).map((row) => row.dealId),
    ).size;

    return {
      leads,
      closed,
      revenue,
      // Of the deals that got as far as the closing stage in this window, how
      // many were won in it.
      conversion: reached === 0 ? 0 : closed / reached,
    };
  }

  const currentValues = measure(current);
  const previousValues = measure(previous);

  const readings = Object.fromEntries(
    KPI_METRICS.map((metric) => {
      const now_ = currentValues[metric];
      const then = previousValues[metric];
      return [
        metric,
        {
          metric,
          current: now_,
          previous: then,
          changeRatio: then === 0 ? null : (now_ - then) / then,
        },
      ];
    }),
  ) as Record<KpiMetric, KpiReading>;

  const series: ChartBucket[] = buckets.map((bucket) => ({
    label: bucket.label,
    start: bucket.start,
    end: bucket.end,
    values: measure(bucket),
  }));

  const board = await getBoard("outbound");
  const stageRows = board?.stages ?? [];
  const openTotal = stageRows
    .filter((stage) => !stage.isWon && !stage.isLost)
    .reduce((total, stage) => total + stage.metrics.count, 0);

  return { period, readings, series, stages: stageRows, openTotal };
}


