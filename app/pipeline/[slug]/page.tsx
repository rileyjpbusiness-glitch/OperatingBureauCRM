import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { BoardClient } from "@/components/board/board-client";
import { DealPanel } from "@/components/panel/deal-panel";
import { readViewState, type PageSearchParams } from "@/lib/search-params";
import {
  countBinned,
  getBoard,
  getDealDetail,
  listBinnedCards,
  listPipelines,
} from "@/lib/repo";

// Reads SQLite on every request; there is nothing here to cache.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pipelines = await listPipelines();
  const pipeline = pipelines.find((candidate) => candidate.slug === slug);
  return { title: pipeline ? `${pipeline.name} - Bureau` : "Bureau" };
}

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ slug }, rawSearch] = await Promise.all([params, searchParams]);
  const { filters, showStats, dealId, binOpen } = readViewState(rawSearch);

  const [pipelines, board, binCount, binned] = await Promise.all([
    listPipelines(),
    getBoard(slug, filters),
    countBinned(),
    binOpen ? listBinnedCards() : Promise.resolve([]),
  ]);
  if (!board) notFound();

  const detail = dealId ? await getDealDetail(dealId) : null;
  const firstStage = board.stages[0];

  return (
    <AppShell
      pipelines={pipelines}
      activeSlug={slug}
      binCount={binCount}
      binned={binned}
      binOpen={binOpen}
      {...(firstStage
        ? {
            newLeadTarget: {
              pipelineId: board.pipeline.id,
              stageId: firstStage.id,
            },
          }
        : {})}
    >
      <BoardClient board={board} showStats={showStats} />
      <DealPanel detail={detail} />
    </AppShell>
  );
}
