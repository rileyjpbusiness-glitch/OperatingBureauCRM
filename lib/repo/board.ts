import {
  SEQUENCE_STEPS,
  SEQUENCE_STEP_LABELS,
} from "@/lib/db/enums";

import { listActivities } from "./activities";
import { getDealCard, listDealCards } from "./deals";
import { stageMetricsFor } from "./metrics";
import { listNotes } from "./notes";
import { getPipelineById, getPipelineBySlug } from "./pipelines";
import { listStages } from "./stages";
import { listTags } from "./tags";
import { listTasks } from "./tasks";
import { listTouches } from "./touches";
import type {
  Board,
  DealCard,
  DealDetail,
  DealFilters,
  HistoryEntry,
  SequenceBoard,
} from "./types";

/**
 * Everything one board render needs, assembled in one place so the page does a
 * single await and no component reaches for a second query.
 */
export async function getBoard(
  slug: string,
  filters: DealFilters = {},
): Promise<Board | null> {
  const pipeline = await getPipelineBySlug(slug);
  if (!pipeline) return null;

  const now = new Date();
  const [stages, cards] = await Promise.all([
    listStages(pipeline.id),
    listDealCards({ pipelineId: pipeline.id, filters, now }),
  ]);

  const { byStageId, bottleneckStageId } = stageMetricsFor({
    pipelineId: pipeline.id,
    stages,
    cards,
    filters,
    now,
  });

  const cardsByStage: Record<string, DealCard[]> = {};
  for (const stage of stages) cardsByStage[stage.id] = [];
  for (const card of cards) {
    const list = cardsByStage[card.stageId];
    if (list) list.push(card);
  }
  for (const list of Object.values(cardsByStage)) {
    list.sort((a, b) => a.position - b.position);
  }

  return {
    pipeline,
    stages: stages.map((stage) => {
      const metrics = byStageId[stage.id];
      if (!metrics) {
        throw new Error(`Missing metrics for stage ${stage.id}`);
      }
      return { ...stage, metrics };
    }),
    cardsByStage,
    bottleneckStageId,
  };
}

/**
 * The follow-up sub-board: the same cards as the In Sequence column, split by
 * where each one sits in the cadence. Deals marked no_answer have left the
 * stage for Lost but stay in the last column so the size of the pile is
 * visible.
 */
export async function getSequenceBoard(
  slug: string,
  filters: DealFilters = {},
): Promise<SequenceBoard | null> {
  const pipeline = await getPipelineBySlug(slug);
  if (!pipeline) return null;

  const stages = await listStages(pipeline.id);
  const stage = stages.find((candidate) => candidate.isSequence);
  if (!stage) return null;

  const now = new Date();
  const cards = await listDealCards({ pipelineId: pipeline.id, filters, now });

  const inSequence = cards.filter(
    (card) =>
      card.sequenceStep !== null &&
      (card.stageId === stage.id || card.sequenceStep === "no_answer"),
  );

  const columns = SEQUENCE_STEPS.map((step) => ({
    step,
    label: SEQUENCE_STEP_LABELS[step],
    cards: inSequence
      .filter((card) => card.sequenceStep === step)
      .sort((a, b) => a.position - b.position),
  }));

  return { pipeline, stage, columns };
}

/** Everything the detail panel renders, in one round trip. */
export async function getDealDetail(dealId: string): Promise<DealDetail | null> {
  const card = await getDealCard(dealId);
  if (!card) return null;

  const [pipeline, stages, notes, activities, touches, tasks, allTags] =
    await Promise.all([
      getPipelineById(card.pipelineId),
      listStages(card.pipelineId),
      listNotes(dealId),
      listActivities(dealId),
      listTouches(dealId),
      listTasks(dealId),
      listTags(),
    ]);

  const stage = stages.find((candidate) => candidate.id === card.stageId);
  if (!pipeline || !stage) return null;

  // Logging a touch also writes a touch_logged activity. The touch row carries
  // strictly more detail, so only it appears in the feed.
  const history: HistoryEntry[] = [
    ...activities
      .filter((activity) => activity.type !== "touch_logged")
      .map((activity) => ({
        kind: "activity" as const,
        at: activity.createdAt,
        activity,
      })),
    ...touches.map((touch) => ({
      kind: "touch" as const,
      at: touch.occurredAt,
      touch,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { card, stage, pipeline, stages, notes, history, tasks, allTags };
}
