import type { Board } from "@/lib/repo/types";

import { StageColumn } from "./stage-column";

export function BoardView({ board }: { board: Board }) {
  // Conversion is measured against the previous stage in the funnel, and lost
  // stages are not part of it, so the label has to skip them the same way the
  // metric does.
  const funnel = board.stages.filter((stage) => !stage.isLost);

  return (
    <div className="scrollbar-thin flex h-full gap-2 overflow-x-auto overflow-y-hidden p-2">
      {board.stages.map((stage) => {
        const funnelIndex = funnel.findIndex((s) => s.id === stage.id);
        const previous =
          funnelIndex > 0 ? funnel[funnelIndex - 1]?.name ?? null : null;

        return (
          <StageColumn
            key={stage.id}
            stage={stage}
            cards={board.cardsByStage[stage.id] ?? []}
            previousStageName={previous}
            isBottleneck={board.bottleneckStageId === stage.id}
          />
        );
      })}
    </div>
  );
}
