import { and, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db } from "@/lib/db/client";
import { activities, contacts, deals, stages } from "@/lib/db/schema";

import { isDueOrOverdue } from "@/lib/dates";

import { dealFilterConditions } from "./filters";
import { monthlyRecurringCents } from "./money";
import type { DealCard, DealFilters, Stage, StageMetrics } from "./types";

/**
 * Below this many deals a conversion rate is noise, so the header shows nothing
 * rather than a confident-looking percentage off a handful of rows. A young
 * pipeline shows blanks until it has enough history to say something true.
 */
const MIN_CONVERSION_SAMPLE = 5;

/**
 * Every (deal, stage) pair the pipeline has ever produced, read off the
 * activity log rather than the deals' current positions. A deal that has moved
 * on still counts toward the stages it passed through, which is the whole point
 * of measuring conversion historically.
 */
function stageEntries(
  pipelineId: string,
  filters: DealFilters,
  now: Date,
): { dealId: string; stageId: string }[] {
  // The activity's destination stage and the deal's current stage are both the
  // stages table, so the destination gets an alias. Filters such as stale-only
  // read the current stage, which stays unaliased.
  const toStage = alias(stages, "to_stage");

  const conditions = dealFilterConditions(filters, now);
  conditions.push(eq(deals.pipelineId, pipelineId));
  conditions.push(isNotNull(activities.toStageId));

  return db
    .selectDistinct({
      dealId: activities.dealId,
      stageId: sql<string>`${activities.toStageId}`,
    })
    .from(activities)
    .innerJoin(toStage, eq(toStage.id, activities.toStageId))
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .innerJoin(stages, eq(stages.id, deals.stageId))
    .where(and(...conditions))
    .all();
}

export type PipelineMetrics = {
  byStageId: Record<string, StageMetrics>;
  /** Worst conversion step with a large enough sample, or null. */
  bottleneckStageId: string | null;
};

/**
 * Column headers for one pipeline.
 *
 * Conversion is funnel-shaped: "reached this stage or any later one" over
 * "reached the previous stage or any later one". Counting later stages too is
 * what stops a skipped stage from reading as a total loss, and lost stages are
 * excluded from the funnel entirely so dropping a deal into Lost does not
 * retroactively credit it with reaching everything before it.
 *
 * Average days in stage measures the deals sitting there now, which is the
 * number that tells you where work is piling up today.
 */
export function stageMetricsFor(input: {
  pipelineId: string;
  stages: Stage[];
  cards: DealCard[];
  filters?: DealFilters;
  now?: Date;
}): PipelineMetrics {
  const now = input.now ?? new Date();
  const filters = input.filters ?? {};
  const ordered = [...input.stages].sort((a, b) => a.position - b.position);
  const funnel = ordered.filter((stage) => !stage.isLost);

  const entries = stageEntries(input.pipelineId, filters, now);

  const stageById = new Map(ordered.map((stage) => [stage.id, stage]));
  const enteredByStage = new Map<string, Set<string>>();
  const maxFunnelPositionByDeal = new Map<string, number>();

  for (const entry of entries) {
    const stage = stageById.get(entry.stageId);
    if (!stage) continue;

    const set = enteredByStage.get(entry.stageId) ?? new Set<string>();
    set.add(entry.dealId);
    enteredByStage.set(entry.stageId, set);

    if (!stage.isLost) {
      const current = maxFunnelPositionByDeal.get(entry.dealId);
      if (current === undefined || stage.position > current) {
        maxFunnelPositionByDeal.set(entry.dealId, stage.position);
      }
    }
  }

  const reachedAtOrBeyond = (position: number): number => {
    let count = 0;
    for (const max of maxFunnelPositionByDeal.values()) {
      if (max >= position) count += 1;
    }
    return count;
  };

  const cardsByStage = new Map<string, DealCard[]>();
  for (const card of input.cards) {
    const list = cardsByStage.get(card.stageId) ?? [];
    list.push(card);
    cardsByStage.set(card.stageId, list);
  }

  const funnelIndex = new Map(funnel.map((stage, index) => [stage.id, index]));
  const byStageId: Record<string, StageMetrics> = {};

  for (const stage of ordered) {
    const cards = cardsByStage.get(stage.id) ?? [];

    let recurring = 0;
    let totalDays = 0;
    let dueCount = 0;
    for (const card of cards) {
      recurring += monthlyRecurringCents(card.value, card.valueType);
      totalDays += card.daysInStage;
      if (card.status === "open" && isDueOrOverdue(card.nextActionAt, now)) {
        dueCount += 1;
      }
    }

    const index = funnelIndex.get(stage.id);
    const everReached = stage.isLost
      ? (enteredByStage.get(stage.id)?.size ?? 0)
      : reachedAtOrBeyond(stage.position);

    let conversionFromPrevious: number | null = null;
    if (index !== undefined && index > 0) {
      const previous = funnel[index - 1];
      if (previous) {
        const denominator = reachedAtOrBeyond(previous.position);
        if (denominator >= MIN_CONVERSION_SAMPLE) {
          conversionFromPrevious = everReached / denominator;
        }
      }
    }

    byStageId[stage.id] = {
      stageId: stage.id,
      count: cards.length,
      dueCount,
      totalMonthlyRecurringCents: recurring,
      avgDaysInStage: cards.length === 0 ? null : totalDays / cards.length,
      conversionFromPrevious,
      everReached,
    };
  }

  let bottleneckStageId: string | null = null;
  let worstRate = Number.POSITIVE_INFINITY;
  for (const stage of funnel) {
    // Closing to Won is a real step, but Won is an outcome rather than a stage
    // anyone works, and it renders as a collapsed rail. Flagging it would hide
    // the flag and point at nothing actionable.
    if (stage.isWon) continue;
    const metrics = byStageId[stage.id];
    if (!metrics || metrics.conversionFromPrevious === null) continue;
    if (metrics.conversionFromPrevious < worstRate) {
      worstRate = metrics.conversionFromPrevious;
      bottleneckStageId = stage.id;
    }
  }

  return { byStageId, bottleneckStageId };
}
