import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  FIRST_SEQUENCE_STEP,
  type Owner,
  type SequenceStep,
  type ValueType,
} from "@/lib/db/enums";
import { db, type Db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { contacts, deals, notes, pipelines, stages } from "@/lib/db/schema";

import { writeActivity, type DbHandle } from "./activity-log";
import { createContact, type ContactInput } from "./contacts";
import { combine, dealFilterConditions } from "./filters";
import { tagsByContactId } from "./tags";
import type {
  Contact,
  Deal,
  DealCard,
  DealFilters,
  Stage,
  Staleness,
} from "./types";

const MS_PER_DAY = 86_400_000;
const POSITION_GAP = 1000;
/** Below this, repeated midpoint inserts start losing precision. */
const MIN_POSITION_GAP = 0.0001;

export function daysInStage(stageEnteredAt: Date, now: Date): number {
  return Math.max(
    0,
    Math.floor((now.getTime() - stageEnteredAt.getTime()) / MS_PER_DAY),
  );
}

export function stalenessFor(days: number, threshold: number | null): Staleness {
  if (threshold === null) return "fresh";
  if (days > threshold * 2) return "critical";
  if (days > threshold) return "stale";
  return "fresh";
}

export async function getDeal(id: string): Promise<Deal | null> {
  return db.select().from(deals).where(eq(deals.id, id)).get() ?? null;
}

function buildCards(
  rows: { deal: Deal; contact: Contact; stage: Stage }[],
  tagMap: Map<string, { id: string; name: string; color: string }[]>,
  now: Date,
): DealCard[] {
  return rows.map(({ deal, contact, stage }) => {
    const days = daysInStage(deal.stageEnteredAt, now);
    return {
      ...deal,
      contact,
      tags: tagMap.get(contact.id) ?? [],
      daysInStage: days,
      staleness: stalenessFor(days, stage.staleAfterDays),
      nextActionOverdue:
        deal.nextActionAt !== null && deal.nextActionAt.getTime() < now.getTime(),
    };
  });
}

export async function listDealCards(options: {
  pipelineId?: string;
  contactId?: string;
  filters?: DealFilters;
  now?: Date;
}): Promise<DealCard[]> {
  const now = options.now ?? new Date();
  const conditions = dealFilterConditions(options.filters ?? {}, now);
  if (options.pipelineId) {
    conditions.push(eq(deals.pipelineId, options.pipelineId));
  }
  if (options.contactId) {
    conditions.push(eq(deals.contactId, options.contactId));
  }

  const rows = db
    .select({ deal: deals, contact: contacts, stage: stages })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .innerJoin(stages, eq(stages.id, deals.stageId))
    .where(combine(conditions))
    .orderBy(asc(stages.position), asc(deals.position))
    .all();

  const tagMap = await tagsByContactId([
    ...new Set(rows.map((row) => row.contact.id)),
  ]);
  return buildCards(rows, tagMap, now);
}

export async function getDealCard(id: string): Promise<DealCard | null> {
  const now = new Date();
  const row = db
    .select({ deal: deals, contact: contacts, stage: stages })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .innerJoin(stages, eq(stages.id, deals.stageId))
    .where(eq(deals.id, id))
    .get();
  if (!row) return null;

  const tagMap = await tagsByContactId([row.contact.id]);
  return buildCards([row], tagMap, now)[0] ?? null;
}

/** Next free position at the top of a stage. */
function positionAtTop(handle: DbHandle, stageId: string): number {
  const row = handle
    .select({ min: sql<number | null>`min(${deals.position})` })
    .from(deals)
    .where(eq(deals.stageId, stageId))
    .get();
  const min = row?.min;
  return min === null || min === undefined ? POSITION_GAP : min - POSITION_GAP;
}

export type CreateDealInput = {
  contactId: string;
  pipelineId: string;
  stageId: string;
  title: string;
  value?: number;
  valueType?: ValueType;
  owner: Owner;
  nextAction?: string | null;
  nextActionAt?: Date | null;
  /** The seed backdates deals so the funnel has real history. */
  createdAt?: Date;
};

function insertDeal(handle: DbHandle, input: CreateDealInput): Deal {
  const now = input.createdAt ?? new Date();
  const stage = handle
    .select()
    .from(stages)
    .where(eq(stages.id, input.stageId))
    .get();

  const row: Deal = {
    id: newId("deal"),
    contactId: input.contactId,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    title: input.title.trim(),
    value: input.value ?? 0,
    valueType: input.valueType ?? "monthly_recurring",
    status: "open",
    lostReason: null,
    owner: input.owner,
    nextAction: input.nextAction?.trim() || null,
    nextActionAt: input.nextActionAt ?? null,
    sequenceStep: stage?.isSequence ? FIRST_SEQUENCE_STEP : null,
    position: positionAtTop(handle, input.stageId),
    stageEnteredAt: now,
    createdAt: now,
    updatedAt: now,
  };

  handle.insert(deals).values(row).run();

  // The created activity carries toStageId so "ever reached this stage" is a
  // single predicate over activities, whether the deal was dropped in at the
  // top of the funnel or quick-added halfway down it.
  writeActivity(handle, {
    dealId: row.id,
    type: "created",
    toStageId: row.stageId,
    meta: { title: row.title, value: row.value, valueType: row.valueType },
    at: now,
  });

  return row;
}

export async function createDeal(input: CreateDealInput): Promise<Deal> {
  return db.transaction((tx) => insertDeal(tx, input));
}

/**
 * Quick-add from a board column: one contact and one deal, one transaction.
 */
export async function createContactWithDeal(input: {
  contact: ContactInput;
  pipelineId: string;
  stageId: string;
  title?: string;
  value?: number;
  valueType?: ValueType;
  owner?: Owner;
}): Promise<{ contact: Contact; deal: Deal }> {
  const contact = await createContact(input.contact);
  const deal = await createDeal({
    contactId: contact.id,
    pipelineId: input.pipelineId,
    stageId: input.stageId,
    title: input.title?.trim() || defaultDealTitle(contact),
    ...(input.value === undefined ? {} : { value: input.value }),
    ...(input.valueType === undefined ? {} : { valueType: input.valueType }),
    // Deals inherit the contact's owner unless told otherwise.
    owner: input.owner ?? contact.owner,
  });
  return { contact, deal };
}

export function defaultDealTitle(contact: Contact): string {
  const name = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const org = contact.company ?? contact.instagramHandle;
  return org ? `${name} - ${org}` : name;
}

/**
 * Recomputes a stage's positions on a clean 1000 grid. Called when repeated
 * midpoint inserts have squeezed two neighbours too close together.
 */
function renormalize(handle: DbHandle, stageId: string): void {
  const siblings = handle
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.stageId, stageId))
    .orderBy(asc(deals.position))
    .all();

  siblings.forEach((sibling, index) => {
    handle
      .update(deals)
      .set({ position: (index + 1) * POSITION_GAP })
      .where(eq(deals.id, sibling.id))
      .run();
  });
}

function positionForIndex(
  handle: DbHandle,
  stageId: string,
  targetIndex: number,
  excludeDealId: string,
): { position: number; needsRenormalize: boolean } {
  const siblings = handle
    .select({ id: deals.id, position: deals.position })
    .from(deals)
    .where(eq(deals.stageId, stageId))
    .orderBy(asc(deals.position))
    .all()
    .filter((sibling) => sibling.id !== excludeDealId);

  const index = Math.max(0, Math.min(targetIndex, siblings.length));
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = siblings[index];

  if (!previous && !next) return { position: POSITION_GAP, needsRenormalize: false };
  if (!previous && next) {
    return { position: next.position - POSITION_GAP, needsRenormalize: false };
  }
  if (previous && !next) {
    return { position: previous.position + POSITION_GAP, needsRenormalize: false };
  }
  if (previous && next) {
    const gap = next.position - previous.position;
    return {
      position: previous.position + gap / 2,
      needsRenormalize: gap < MIN_POSITION_GAP,
    };
  }
  return { position: POSITION_GAP, needsRenormalize: false };
}

/**
 * The one function drag and drop calls. Moving within a stage only reorders;
 * moving across stages also resets stageEnteredAt, writes the stage_changed
 * activity, and applies whatever won or lost means for the destination.
 */
export async function moveDeal(input: {
  dealId: string;
  toStageId: string;
  targetIndex: number;
  at?: Date;
}): Promise<Deal> {
  return db.transaction((tx) => {
    const deal = tx.select().from(deals).where(eq(deals.id, input.dealId)).get();
    if (!deal) throw new Error(`Deal ${input.dealId} not found`);

    const toStage = tx
      .select()
      .from(stages)
      .where(eq(stages.id, input.toStageId))
      .get();
    if (!toStage) throw new Error(`Stage ${input.toStageId} not found`);
    if (toStage.pipelineId !== deal.pipelineId) {
      throw new Error("Cannot move a deal into another pipeline's stage");
    }

    const now = input.at ?? new Date();
    const sameStage = deal.stageId === input.toStageId;
    const { position, needsRenormalize } = positionForIndex(
      tx,
      input.toStageId,
      input.targetIndex,
      deal.id,
    );

    const status = sameStage
      ? deal.status
      : toStage.isWon
        ? "won"
        : toStage.isLost
          ? "lost"
          : "open";

    // Dragging into the sequence stage starts the cadence at day one; dragging
    // anywhere else ends it. Reordering within a stage leaves it alone.
    const sequenceStep = sameStage
      ? deal.sequenceStep
      : toStage.isSequence
        ? FIRST_SEQUENCE_STEP
        : null;

    tx.update(deals)
      .set({
        stageId: input.toStageId,
        position,
        status,
        sequenceStep,
        // Reopening a deal by dragging it back out of Won or Lost clears the
        // reason it carried.
        lostReason: status === "lost" ? deal.lostReason : null,
        ...(sameStage ? {} : { stageEnteredAt: now }),
        updatedAt: now,
      })
      .where(eq(deals.id, deal.id))
      .run();

    if (!sameStage) {
      writeActivity(tx, {
        dealId: deal.id,
        type: "stage_changed",
        fromStageId: deal.stageId,
        toStageId: input.toStageId,
        at: now,
      });

      if (sequenceStep !== deal.sequenceStep) {
        writeActivity(tx, {
          dealId: deal.id,
          type: "sequence_step_changed",
          toStageId: input.toStageId,
          meta: { from: deal.sequenceStep, to: sequenceStep },
          at: now,
        });
      }

      if (toStage.isWon && deal.status !== "won") {
        writeActivity(tx, {
          dealId: deal.id,
          type: "won",
          toStageId: input.toStageId,
          meta: { value: deal.value, valueType: deal.valueType },
          at: now,
        });
        handoffToNextPipeline(tx, deal, now);
      }
      if (toStage.isLost && deal.status !== "lost") {
        writeActivity(tx, {
          dealId: deal.id,
          type: "lost",
          toStageId: input.toStageId,
          meta: deal.lostReason ? { lostReason: deal.lostReason } : null,
          at: now,
        });
      }
    }

    if (needsRenormalize) renormalize(tx, input.toStageId);

    const updated = tx.select().from(deals).where(eq(deals.id, deal.id)).get();
    if (!updated) throw new Error("Deal vanished mid-transaction");
    return updated;
  });
}

/**
 * Winning a deal opens the next pipeline's version of it. Generic rather than
 * hardcoded to delivery: the next pipeline is whichever one sits after this
 * one by position. Skipped when the contact already has an open deal there,
 * so re-winning a deal does not pile up duplicates.
 */
function handoffToNextPipeline(handle: DbHandle, deal: Deal, now: Date): void {
  const current = handle
    .select()
    .from(pipelines)
    .where(eq(pipelines.id, deal.pipelineId))
    .get();
  if (!current) return;

  const next = handle
    .select()
    .from(pipelines)
    .where(sql`${pipelines.position} > ${current.position}`)
    .orderBy(asc(pipelines.position))
    .get();
  if (!next) return;

  const alreadyThere = handle
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(
        eq(deals.contactId, deal.contactId),
        eq(deals.pipelineId, next.id),
        eq(deals.status, "open"),
      ),
    )
    .get();
  if (alreadyThere) return;

  const firstStage = handle
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, next.id))
    .orderBy(asc(stages.position))
    .get();
  if (!firstStage) return;

  const created = insertDeal(handle, {
    contactId: deal.contactId,
    pipelineId: next.id,
    stageId: firstStage.id,
    title: deal.title,
    value: deal.value,
    valueType: deal.valueType,
    owner: deal.owner,
    createdAt: now,
  });

  // Explain the deal's existence to whoever opens it. A real note rather than
  // a bare activity row, so it shows up where someone would actually look.
  const noteId = newId("note");
  const amount = `$${(deal.value / 100).toLocaleString()}`;
  handle
    .insert(notes)
    .values({
      id: noteId,
      dealId: created.id,
      body: `Handed off from **${current.name}** on close. Sold at ${amount} ${
        deal.valueType === "one_time" ? "one-time" : "per month"
      }.\n\nCollect access and assets before anything else.`,
      author: deal.owner,
      pinned: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  writeActivity(handle, {
    dealId: created.id,
    type: "note_added",
    meta: {
      noteId,
      handoffFromDealId: deal.id,
      fromPipeline: current.name,
    },
    at: now,
  });
}

/**
 * Moves a deal along the follow-up cadence, which is the sub-board's only
 * mutation.
 *
 * `no_answer` is the end of the cadence rather than a step in it: the deal is
 * marked lost and moves to the Lost stage on the main board, but keeps the
 * no_answer step so it stays visible, dimmed, in the sub-board's last column.
 * Every other step keeps the deal in the sequence stage.
 */
export async function setSequenceStep(input: {
  dealId: string;
  step: SequenceStep;
  targetIndex: number;
  at?: Date;
}): Promise<Deal> {
  return db.transaction((tx) => {
    const deal = tx.select().from(deals).where(eq(deals.id, input.dealId)).get();
    if (!deal) throw new Error(`Deal ${input.dealId} not found`);

    const now = input.at ?? new Date();
    const pipelineStages = tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, deal.pipelineId))
      .orderBy(asc(stages.position))
      .all();

    const sequenceStage = pipelineStages.find((stage) => stage.isSequence);
    if (!sequenceStage) {
      throw new Error(
        `Pipeline ${deal.pipelineId} has no stage running a follow-up sequence`,
      );
    }

    const destination =
      input.step === "no_answer"
        ? pipelineStages.find((stage) => stage.isLost)
        : sequenceStage;
    if (!destination) {
      throw new Error(`Pipeline ${deal.pipelineId} has no Lost stage`);
    }

    const movedStage = destination.id !== deal.stageId;
    const { position, needsRenormalize } = positionForIndex(
      tx,
      destination.id,
      input.targetIndex,
      deal.id,
    );

    tx.update(deals)
      .set({
        stageId: destination.id,
        position,
        sequenceStep: input.step,
        ...(input.step === "no_answer"
          ? { status: "lost" as const, lostReason: deal.lostReason ?? "No answer" }
          : { status: "open" as const, lostReason: null }),
        ...(movedStage ? { stageEnteredAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(deals.id, deal.id))
      .run();

    if (movedStage) {
      writeActivity(tx, {
        dealId: deal.id,
        type: "stage_changed",
        fromStageId: deal.stageId,
        toStageId: destination.id,
        at: now,
      });
    }

    if (deal.sequenceStep !== input.step) {
      writeActivity(tx, {
        dealId: deal.id,
        type: "sequence_step_changed",
        toStageId: destination.id,
        meta: { from: deal.sequenceStep, to: input.step },
        at: now,
      });
    }

    if (input.step === "no_answer" && deal.status !== "lost") {
      writeActivity(tx, {
        dealId: deal.id,
        type: "lost",
        toStageId: destination.id,
        meta: { lostReason: "No answer" },
        at: now,
      });
    }

    if (needsRenormalize) renormalize(tx, destination.id);

    const updated = tx.select().from(deals).where(eq(deals.id, deal.id)).get();
    if (!updated) throw new Error("Deal vanished mid-transaction");
    return updated;
  });
}

export type DealPatch = {
  title?: string;
  value?: number;
  valueType?: ValueType;
  owner?: Owner;
  nextAction?: string | null;
  nextActionAt?: Date | null;
  lostReason?: string | null;
};

export async function updateDeal(
  id: string,
  patch: DealPatch,
): Promise<Deal | null> {
  return db.transaction((tx) => {
    const existing = tx.select().from(deals).where(eq(deals.id, id)).get();
    if (!existing) return null;

    const now = new Date();
    const next: Record<string, unknown> = { updatedAt: now };
    if (patch.title !== undefined) next.title = patch.title.trim();
    if (patch.value !== undefined) next.value = patch.value;
    if (patch.valueType !== undefined) next.valueType = patch.valueType;
    if (patch.owner !== undefined) next.owner = patch.owner;
    if (patch.nextAction !== undefined)
      next.nextAction = patch.nextAction?.trim() || null;
    if (patch.nextActionAt !== undefined) next.nextActionAt = patch.nextActionAt;
    if (patch.lostReason !== undefined)
      next.lostReason = patch.lostReason?.trim() || null;

    tx.update(deals).set(next).where(eq(deals.id, id)).run();

    const valueChanged =
      (patch.value !== undefined && patch.value !== existing.value) ||
      (patch.valueType !== undefined && patch.valueType !== existing.valueType);

    if (valueChanged) {
      writeActivity(tx, {
        dealId: id,
        type: "value_changed",
        meta: {
          from: { value: existing.value, valueType: existing.valueType },
          to: {
            value: patch.value ?? existing.value,
            valueType: patch.valueType ?? existing.valueType,
          },
        },
        at: now,
      });
    }

    return tx.select().from(deals).where(eq(deals.id, id)).get() ?? null;
  });
}

export async function deleteDeal(id: string): Promise<void> {
  db.delete(deals).where(eq(deals.id, id)).run();
}

/** Used by the dashboard's needs-attention list. */
export async function listDealsNeedingAttention(options: {
  now?: Date;
  limit?: number;
} = {}): Promise<{ stale: DealCard[]; overdue: DealCard[] }> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;

  const open = await listDealCards({ now });
  const openOnly = open.filter((card) => card.status === "open");

  const stale = openOnly
    .filter((card) => card.staleness !== "fresh")
    .sort((a, b) => b.daysInStage - a.daysInStage)
    .slice(0, limit);

  const overdue = openOnly
    .filter((card) => card.nextActionOverdue)
    .sort(
      (a, b) =>
        (a.nextActionAt?.getTime() ?? 0) - (b.nextActionAt?.getTime() ?? 0),
    )
    .slice(0, limit);

  return { stale, overdue };
}

export async function listDealsForContact(
  contactId: string,
): Promise<DealCard[]> {
  return listDealCards({ contactId });
}

/** Drops a batch of freshly imported contacts into one stage. */
export async function createDealsForContacts(input: {
  contactIds: string[];
  pipelineId: string;
  stageId: string;
  owner: Owner;
}): Promise<Deal[]> {
  if (input.contactIds.length === 0) return [];

  return db.transaction((tx) => {
    const rows = tx
      .select()
      .from(contacts)
      .where(inArray(contacts.id, input.contactIds))
      .all();

    return rows.map((contact) =>
      insertDeal(tx, {
        contactId: contact.id,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        title: defaultDealTitle(contact),
        owner: input.owner,
      }),
    );
  });
}

export type { Db };
