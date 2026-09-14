import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SequenceClient } from "@/components/board/sequence-client";
import { DealPanel } from "@/components/panel/deal-panel";
import { readViewState, type PageSearchParams } from "@/lib/search-params";
import {
  getDealDetail,
  getSequenceBoard,
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
  const { filters, dealId } = readViewState(rawSearch);

  const [pipelines, board] = await Promise.all([
    listPipelines(),
    getSequenceBoard(slug, filters),
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
    <AppShell pipelines={pipelines} activeSlug={slug}>
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
          <Link
            href={`/pipeline/${slug}`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px]"
          >
            <ArrowLeft className="size-3" />
            {board.pipeline.name}
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-[11px] font-medium">{board.stage.name}</span>
          <span className="text-muted-foreground/60 ml-2 text-[10px]">
            One follow-up a day for five days, then one a week for four weeks.
          </span>
        </div>

        <div className="min-h-0 flex-1">
          <SequenceClient board={board} repliedStage={repliedStage} />
        </div>
      </div>
      <DealPanel detail={detail} />
    </AppShell>
  );
}
