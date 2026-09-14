import { and, desc, gte, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";

import type {
  TouchChannel,
  TouchDirection,
  TouchOrigin,
  TouchOutcome,
} from "@/lib/db/enums";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { touches } from "@/lib/db/schema";

import { writeActivity } from "./activity-log";
import type { Touch } from "./types";

export async function listTouches(dealId: string): Promise<Touch[]> {
  return db
    .select()
    .from(touches)
    .where(eq(touches.dealId, dealId))
    .orderBy(desc(touches.occurredAt))
    .all();
}

export async function createTouch(input: {
  dealId: string;
  channel: TouchChannel;
  direction: TouchDirection;
  outcome: TouchOutcome;
  sequenceStep?: number | null;
  bodySnippet?: string | null;
  occurredAt?: Date;
  /** Everything the UI writes is "manual"; a future sync writes "sync". */
  origin?: TouchOrigin;
  externalId?: string | null;
}): Promise<Touch> {
  const occurredAt = input.occurredAt ?? new Date();
  const row: Touch = {
    id: newId("touch"),
    dealId: input.dealId,
    channel: input.channel,
    direction: input.direction,
    sequenceStep: input.sequenceStep ?? null,
    outcome: input.outcome,
    bodySnippet: input.bodySnippet?.trim() || null,
    occurredAt,
    origin: input.origin ?? "manual",
    externalId: input.externalId ?? null,
    createdAt: new Date(),
  };

  return db.transaction((tx) => {
    tx.insert(touches).values(row).run();
    writeActivity(tx, {
      dealId: input.dealId,
      type: "touch_logged",
      meta: {
        touchId: row.id,
        channel: row.channel,
        direction: row.direction,
        outcome: row.outcome,
        sequenceStep: row.sequenceStep,
      },
      at: occurredAt,
    });
    return row;
  });
}

export async function deleteTouch(id: string): Promise<void> {
  db.delete(touches).where(eq(touches.id, id)).run();
}

export type ChannelVolume = {
  channel: TouchChannel;
  day: string;
  count: number;
};

/** Powers the dashboard's touch volume by channel chart. */
export async function touchVolumeByChannel(options: {
  since: Date;
  direction?: TouchDirection;
}): Promise<ChannelVolume[]> {
  const conditions = [gte(touches.occurredAt, options.since)];
  if (options.direction) {
    conditions.push(eq(touches.direction, options.direction));
  }

  return db
    .select({
      channel: touches.channel,
      day: sql<string>`date(${touches.occurredAt} / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`,
    })
    .from(touches)
    .where(and(...conditions))
    .groupBy(touches.channel, sql`date(${touches.occurredAt} / 1000, 'unixepoch')`)
    .all();
}

export type TouchTotals = {
  outboundSent: number;
  replies: number;
  positiveReplies: number;
  booked: number;
};

export async function touchTotalsSince(since: Date): Promise<TouchTotals> {
  const rows = db
    .select({
      direction: touches.direction,
      outcome: touches.outcome,
      count: sql<number>`count(*)`,
    })
    .from(touches)
    .where(gte(touches.occurredAt, since))
    .groupBy(touches.direction, touches.outcome)
    .all();

  const totals: TouchTotals = {
    outboundSent: 0,
    replies: 0,
    positiveReplies: 0,
    booked: 0,
  };

  for (const row of rows) {
    if (row.direction === "outbound") totals.outboundSent += row.count;
    if (row.outcome === "replied" || row.outcome === "positive_reply") {
      totals.replies += row.count;
    }
    if (row.outcome === "positive_reply") totals.positiveReplies += row.count;
    if (row.outcome === "booked") totals.booked += row.count;
  }

  return totals;
}
