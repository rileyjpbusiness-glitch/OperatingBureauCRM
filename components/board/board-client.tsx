"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { binDealAction, moveDealAction } from "@/lib/actions";
import type { Board } from "@/lib/repo/types";

import { DealCard } from "./deal-card";
import { Kanban, type KanbanColumn } from "./kanban";
import { StageHeader } from "./stage-header";

function storageKey(slug: string): string {
  return `bureau.collapsed.${slug}`;
}

export function BoardClient({
  board,
  showStats,
}: {
  board: Board;
  showStats: boolean;
}) {
  const router = useRouter();

  // Won and Lost accumulate forever, so they start as rails. The choice is per
  // browser rather than per database: it is a viewing preference, not data.
  const terminalIds = React.useMemo(
    () =>
      board.stages
        .filter((stage) => stage.isWon || stage.isLost)
        .map((stage) => stage.id),
    [board.stages],
  );

  const [collapsed, setCollapsed] = React.useState<string[]>(terminalIds);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(board.pipeline.slug));
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCollapsed(parsed.filter((id): id is string => typeof id === "string"));
        }
      }
    } catch {
      // A blocked or cleared store just means the defaults stand.
    }
  }, [board.pipeline.slug]);

  const toggle = React.useCallback(
    (stageId: string) => {
      setCollapsed((current) => {
        const next = current.includes(stageId)
          ? current.filter((id) => id !== stageId)
          : [...current, stageId];
        try {
          window.localStorage.setItem(
            storageKey(board.pipeline.slug),
            JSON.stringify(next),
          );
        } catch {
          // Not worth failing the interaction over.
        }
        return next;
      });
    },
    [board.pipeline.slug],
  );

  const columns: KanbanColumn[] = board.stages.map((stage) => {
    const isBottleneck = board.bottleneckStageId === stage.id;
    const isTerminal = stage.isWon || stage.isLost;

    return {
      id: stage.id,
      railLabel: stage.name,
      railCount: stage.metrics.count,
      collapsed: isTerminal && collapsed.includes(stage.id),
      onRailClick: () => toggle(stage.id),
      cards: board.cardsByStage[stage.id] ?? [],
      header: (
        <div
          {...(isTerminal
            ? {
                onDoubleClick: () => toggle(stage.id),
                title: "Double-click to collapse",
              }
            : {})}
        >
          <StageHeader
            stage={stage}
            isBottleneck={isBottleneck}
            showStats={showStats}
            {...(stage.isSequence
              ? { sequenceHref: `/pipeline/${board.pipeline.slug}/sequence` }
              : {})}
          />
        </div>
      ),
    };
  });

  return (
    <Kanban
      id="board"
      columns={columns}
      renderCard={(card) => <DealCard card={card} />}
      renderDragCard={(card) => <DealCard card={card} />}
      onOpen={(dealId) => {
        const params = new URLSearchParams(window.location.search);
        params.set("deal", dealId);
        router.push(`?${params.toString()}`, { scroll: false });
      }}
      onBin={async (cardId) => {
        await binDealAction({ dealId: cardId });
        router.refresh();
      }}
      onMove={async ({ cardId, columnId, index }) => {
        await moveDealAction({
          dealId: cardId,
          toStageId: columnId,
          targetIndex: index,
        });
        router.refresh();
      }}
    />
  );
}
