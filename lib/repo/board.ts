import { listDealCards } from "./deals";
import { stageMetricsFor } from "./metrics";
import { getPipelineBySlug } from "./pipelines";
import { listStages } from "./stages";
import type { Board, DealCard, DealFilters } from "./types";

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
