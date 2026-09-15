import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SequenceClient } from "@/components/board/sequence-client";
import { DealPanel } from "@/components/panel/deal-panel";
import { readViewState, type PageSearchParams } from "@/lib/search-params";
import {
  countBinned,
  getDealDetail,
  getSequenceBoard,
  listBinnedCards,
  listPipelines,
  listStages,
} from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata = { title: "Follow-up sequence - Bureau" };

export default async function SequencePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ slug }, rawSearch] = await Promise.all([params, searchParams]);
  const { filters, dealId, binOpen } = readViewState(rawSearch);

  const [pipelines, board, binCount, binned] = await Promise.all([
    listPipelines(),
    getSequenceBoard(slug, filters),
    countBinned(),
    binOpen ? listBinnedCards() : Promise.resolve([]),
  ]);
  if (!board) notFound();

  const stages = await listStages(board.pipeline.id);
  // The reply bar drops onto whichever stage follows the sequence.
  const repliedStage =
    stages.find(
      (stage) => !stage.isLost && stage.position > board.stage.position,
    ) ?? null;

  const detail = dealId ? await getDealDetail(dealId) : null;

  return (
    <AppShell
      pipelines={pipelines}
      activeSlug={slug}
      binCount={binCount}
      binned={binned}
      binOpen={binOpen}
    >
      <div className="flex h-full flex-col">
        <div className="border-hairline flex h-9 shrink-0 items-center gap-2.5 border-b px-4">
          <Link
            href={`/pipeline/${slug}`}
            className="motion-fast text-text-3 hover:text-text-1 flex items-center gap-1.5 font-mono text-micro tracking-label uppercase outline-none"
          >
            <ArrowLeft className="size-3" strokeWidth={1} />
            {board.pipeline.name}
          </Link>
          <span className="text-text-3">/</span>
          <span className="text-text-1 font-mono text-micro tracking-label uppercase">
            {board.stage.name}
          </span>
          <span className="text-text-3 ml-2 font-sans text-tiny">
            One follow-up a day for five days, then one a week for four weeks.
          </span>
          {board.dueCount > 0 ? (
            <span className="text-signal-warm font-mono text-micro font-medium tracking-badge uppercase">
              {board.dueCount} due
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          <SequenceClient board={board} repliedStage={repliedStage} />
        </div>
      </div>
      <DealPanel detail={detail} />
    </AppShell>
  );
}
