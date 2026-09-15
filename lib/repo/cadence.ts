import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { activities, deals, pipelines, stages } from "@/lib/db/schema";
import { dayNumber, formatDayLabel, startOfDaysAgo } from "@/lib/dates";
import { DAILY_BUILD_TARGET, CADENCE_WINDOW_DAYS } from "@/lib/kpi";

import { notBinned } from "./filters";

/** One day of output against the target. */
export type CadenceDay = {
  start: Date;
  label: string;
  sent: number;
  met: boolean;
};

export type ReplyRate = {
  /** Replied over entered. Null until anyone has entered the cadence. */
  rate: number | null;
  entered: number;
  replied: number;
  noAnswer: number;
  /** Still in the cadence, so neither a reply nor a no. */
  inFlight: number;
};

export type Cadence = {
  target: number;
  today: number;
  /** Oldest first, ending today. */
  days: CadenceDay[];
  /** Consecutive days ending today that hit the target. */
  streak: number;
  /** Days in the window that fell short, today excluded while it is still open. */
  missed: number;
  replyRate: ReplyRate;
};

/**
 * The outbound board's own numbers, which the generic KPI tiles cannot express.
 *
 * The one output that matters is builds going out: a deal reaching the first
 * step of the cadence. Everything upstream of that is preparation and
 * everything downstream depends on it, so it is the only figure with a target
 * attached.
 *
 * Both readings come off the activity log rather than the deals' current
 * positions, so a deal that has since replied, been won or been lost still
 * counts on the day its build went out.
 */
export async function getCadence(now = new Date()): Promise<Cadence> {
  const outbound = db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.slug, "outbound"))
    .get();

  const empty: Cadence = {
    target: DAILY_BUILD_TARGET,
    today: 0,
    days: [],
    streak: 0,
    missed: 0,
    replyRate: {
      rate: null,
      entered: 0,
      replied: 0,
      noAnswer: 0,
      inFlight: 0,
    },
  };
  if (!outbound) return empty;

  const pipelineStages = db
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, outbound.id))
    .all();

  const sequence = pipelineStages.find((stage) => stage.isSequence);
  if (!sequence) return empty;

  // "Replied" is not one stage: a lead that answered and went straight to a
  // booked call has replied just as much. Anything past the cadence that is not
  // a dead end counts.
  const afterSequenceIds = pipelineStages
    .filter((stage) => stage.position > sequence.position && !stage.isLost)
    .map((stage) => stage.id);

  const windowStart = startOfDaysAgo(now, CADENCE_WINDOW_DAYS - 1);

  // Every deal that reached the first step of the cadence inside the window.
  // The step is stored on the activity's meta rather than as its own type.
  const entries = db
    .selectDistinct({ dealId: activities.dealId, at: activities.createdAt })
    .from(activities)
    .innerJoin(deals, eq(deals.id, activities.dealId))
    .where(
      and(
        notBinned(),
        eq(deals.pipelineId, outbound.id),
        eq(activities.type, "sequence_step_changed"),
        sql`json_extract(${activities.meta}, '$.to') = 'day_1'`,
        gte(activities.createdAt, windowStart),
      ),
    )
    .all();

  // A deal can re-enter the cadence; the day it first did is the day it counts.
  const firstEntry = new Map<string, Date>();
  for (const entry of entries) {
    const existing = firstEntry.get(entry.dealId);
    if (!existing || entry.at.getTime() < existing.getTime()) {
      firstEntry.set(entry.dealId, entry.at);
    }
  }

  const perDay = new Map<number, number>();
  for (const at of firstEntry.values()) {
    const key = dayNumber(at);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }

  const days: CadenceDay[] = [];
  for (let back = CADENCE_WINDOW_DAYS - 1; back >= 0; back -= 1) {
    const start = startOfDaysAgo(now, back);
    const sent = perDay.get(dayNumber(start)) ?? 0;
    days.push({
      start,
      label: formatDayLabel(start),
      sent,
      met: sent >= DAILY_BUILD_TARGET,
    });
  }

  const today = days[days.length - 1]?.sent ?? 0;

  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index];
    if (!day) break;
    // Today is still running, so falling short of the target does not yet break
    // a streak; it simply has not been added to one.
    if (index === days.length - 1 && !day.met) continue;
    if (!day.met) break;
    streak += 1;
  }

  // Today cannot have been missed until it is over.
  const missed = days.slice(0, -1).filter((day) => !day.met).length;

  const enteredIds = [...firstEntry.keys()];
  const replied = new Set<string>();
  if (enteredIds.length > 0 && afterSequenceIds.length > 0) {
    for (const row of db
      .selectDistinct({ dealId: activities.dealId })
      .from(activities)
      .where(
        and(
          inArray(activities.dealId, enteredIds),
          isNotNull(activities.toStageId),
          inArray(activities.toStageId, afterSequenceIds),
        ),
      )
      .all()) {
      replied.add(row.dealId);
    }
  }

  const noAnswer = new Set<string>();
  if (enteredIds.length > 0) {
    for (const row of db
      .selectDistinct({ dealId: activities.dealId })
      .from(activities)
      .where(
        and(
          inArray(activities.dealId, enteredIds),
          eq(activities.type, "sequence_step_changed"),
          sql`json_extract(${activities.meta}, '$.to') = 'no_answer'`,
        ),
      )
      .all()) {
      // Answering and then going quiet later is still an answer.
      if (!replied.has(row.dealId)) noAnswer.add(row.dealId);
    }
  }

  const entered = enteredIds.length;
  return {
    target: DAILY_BUILD_TARGET,
    today,
    days,
    streak,
    missed,
    replyRate: {
      // Over everyone who entered, not just the ones who have resolved. A rate
      // measured only against finished conversations flatters itself early and
      // moves for reasons that have nothing to do with the messages.
      rate: entered === 0 ? null : replied.size / entered,
      entered,
      replied: replied.size,
      noAnswer: noAnswer.size,
      inFlight: Math.max(0, entered - replied.size - noAnswer.size),
    },
  };
}
