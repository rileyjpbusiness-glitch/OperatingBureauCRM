import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { BoardView } from "@/components/board/board-view";
import { getBoard, listPipelines } from "@/lib/repo";

// Reads SQLite on every request; there is nothing here to cache.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pipelines = await listPipelines();
  const pipeline = pipelines.find((p) => p.slug === slug);
  return { title: pipeline ? `${pipeline.name} - Bureau CRM` : "Bureau CRM" };
}

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [pipelines, board] = await Promise.all([listPipelines(), getBoard(slug)]);

  if (!board) notFound();

  return (
    <AppShell pipelines={pipelines} activeSlug={slug}>
      <BoardView board={board} />
    </AppShell>
  );
}
