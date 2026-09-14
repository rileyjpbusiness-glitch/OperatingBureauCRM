import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { deals, stages } from "@/lib/db/schema";

import { writeActivity } from "./activity-log";
import type { Stage } from "./types";

export async function listStages(pipelineId: string): Promise<Stage[]> {
  return db
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, pipelineId))
    .orderBy(asc(stages.position))
    .all();
}

export async function getStage(id: string): Promise<Stage | null> {
  return db.select().from(stages).where(eq(stages.id, id)).get() ?? null;
}

export async function createStage(input: {
  pipelineId: string;
  name: string;
  color: string;
  staleAfterDays?: number | null;
  isSequence?: boolean;
  /** Insert at this index. Appends when omitted. */
  position?: number;
}): Promise<Stage> {
  return db.transaction((tx) => {
    const siblings = tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, input.pipelineId))
      .orderBy(asc(stages.position))
      .all();

    const index =
      input.position === undefined
        ? siblings.length
        : Math.max(0, Math.min(input.position, siblings.length));

    // Open a gap rather than renumbering from scratch.
    tx.update(stages)
      .set({ position: sql`${stages.position} + 1` })
      .where(
        and(
          eq(stages.pipelineId, input.pipelineId),
          sql`${stages.position} >= ${index}`,
        ),
      )
      .run();

    const row: Stage = {
      id: newId("stage"),
      pipelineId: input.pipelineId,
      name: input.name,
      position: index,
      color: input.color,
      // `??` would collapse an explicit null into the default. Null means this
      // stage never goes stale, which is the whole point of it on Won and Lost.
      staleAfterDays:
        input.staleAfterDays === undefined ? 7 : input.staleAfterDays,
      isWon: false,
      isLost: false,
      isSequence: input.isSequence ?? false,
    };

    tx.insert(stages).values(row).run();
    return row;
  });
}

export async function updateStage(
  id: string,
  patch: {
    name?: string;
    color?: string;
    staleAfterDays?: number | null;
    isWon?: boolean;
    isLost?: boolean;
    isSequence?: boolean;
  },
): Promise<Stage | null> {
  // Keys explicitly set to undefined mean "leave alone"; null is a real value.
  const next = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  if (Object.keys(next).length > 0) {
    db.update(stages).set(next).where(eq(stages.id, id)).run();
  }
  return getStage(id);
}

/**
 * Writes a whole new ordering at once. Callers pass every stage id in the
 * pipeline in its intended order, which keeps positions dense and avoids the
 * drift that incremental swaps accumulate.
 */
export async function reorderStages(
  pipelineId: string,
  orderedStageIds: string[],
): Promise<Stage[]> {
  return db.transaction((tx) => {
    const existing = tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, pipelineId))
      .all();

    const known = new Set(existing.map((stage) => stage.id));
    const seen = new Set<string>();
    for (const id of orderedStageIds) {
      if (!known.has(id)) {
        throw new Error(`Stage ${id} is not in pipeline ${pipelineId}`);
      }
      if (seen.has(id)) {
        throw new Error(`Stage ${id} appears twice in the new order`);
      }
      seen.add(id);
    }
    if (seen.size !== existing.length) {
      throw new Error(
        `Reorder must list all ${existing.length} stages, got ${seen.size}`,
      );
    }

    orderedStageIds.forEach((id, index) => {
      tx.update(stages).set({ position: index }).where(eq(stages.id, id)).run();
    });

    return tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, pipelineId))
      .orderBy(asc(stages.position))
      .all();
  });
}

export async function countDealsInStage(stageId: string): Promise<number> {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(deals)
    .where(eq(deals.stageId, stageId))
    .get();
  return row?.count ?? 0;
}

/**
 * Deleting a stage that still holds deals would orphan them, so the caller must
 * name a destination. The UI prompts for one; this layer refuses without it.
 */
export async function deleteStage(
  stageId: string,
  moveDealsToStageId?: string,
): Promise<void> {
  db.transaction((tx) => {
    const stage = tx.select().from(stages).where(eq(stages.id, stageId)).get();
    if (!stage) throw new Error(`Stage ${stageId} not found`);

    const remaining = tx
      .select({ count: sql<number>`count(*)` })
      .from(deals)
      .where(eq(deals.stageId, stageId))
      .get();

    if ((remaining?.count ?? 0) > 0) {
      if (!moveDealsToStageId) {
        throw new Error(
          `Stage ${stageId} still holds ${remaining?.count ?? 0} deals; pass a destination stage`,
        );
      }
      const destination = tx
        .select()
        .from(stages)
        .where(eq(stages.id, moveDealsToStageId))
        .get();
      if (!destination || destination.pipelineId !== stage.pipelineId) {
        throw new Error(
          `Destination stage ${moveDealsToStageId} is not in the same pipeline`,
        );
      }

      const now = new Date();
      const displaced = tx
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.stageId, stageId))
        .all();

      tx.update(deals)
        .set({
          stageId: moveDealsToStageId,
          stageEnteredAt: now,
          updatedAt: now,
        })
        .where(eq(deals.stageId, stageId))
        .run();

      // A forced move is still a stage change, so it is logged like any other.
      for (const deal of displaced) {
        writeActivity(tx, {
          dealId: deal.id,
          type: "stage_changed",
          fromStageId: stageId,
          toStageId: moveDealsToStageId,
          meta: { reason: "stage_deleted", deletedStageName: stage.name },
          at: now,
        });
      }
    }

    tx.delete(stages).where(eq(stages.id, stageId)).run();

    // Close the gap so positions stay dense.
    const siblings = tx
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, stage.pipelineId))
      .orderBy(asc(stages.position))
      .all();
    siblings.forEach((sibling, index) => {
      if (sibling.position !== index) {
        tx.update(stages)
          .set({ position: index })
          .where(eq(stages.id, sibling.id))
          .run();
      }
    });
  });
}
