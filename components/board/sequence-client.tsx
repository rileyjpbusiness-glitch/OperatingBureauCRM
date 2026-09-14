"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { moveDealAction, setSequenceStepAction } from "@/lib/actions";
import { SEQUENCE_STEP_LABELS, type SequenceStep } from "@/lib/db/enums";
import type { SequenceBoard, Stage } from "@/lib/repo/types";

import { DealCard } from "./deal-card";
import { Kanban, type KanbanColumn } from "./kanban";

const REPLIED_DROP_ID = "banner:replied";

/**
 * The follow-up cadence, one column per touch. Dragging a card one column right
 * is the act of sending that follow-up.
 */
export function SequenceClient({
  board,
  repliedStage,
}: {
  board: SequenceBoard;
  repliedStage: Stage | null;
}) {
  const router = useRouter();

  const columns: KanbanColumn[] = board.columns.map((column) => ({
    id: column.step,
    railLabel: column.label,
    cards: column.cards,
    // The No Answer pile is a graveyard, not a step, so it reads back.
    dimmed: column.step === "no_answer",
    header: (
      <header className="bg-card/40 flex items-center gap-1.5 rounded-t-md border-b px-2.5 py-2">
        <h2 className="truncate text-[11px] font-semibold tracking-wide uppercase">
          {column.label}
        </h2>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {column.cards.length}
        </span>
      </header>
    ),
  }));

  return (
    <Kanban
      id="sequence"
      columns={columns}
      {...(repliedStage
        ? { banner: { id: REPLIED_DROP_ID, label: "Drop here when they reply" } }
        : {})}
      renderCard={(card) => <DealCard card={card} showStep={false} />}
      renderDragCard={(card) => <DealCard card={card} showStep={false} />}
      onOpen={(dealId) => {
        const params = new URLSearchParams(window.location.search);
        params.set("deal", dealId);
        router.push(`?${params.toString()}`, { scroll: false });
      }}
      onMove={async ({ cardId, columnId, index }) => {
        if (columnId === REPLIED_DROP_ID) {
          if (!repliedStage) return;
          await moveDealAction({
            dealId: cardId,
            toStageId: repliedStage.id,
            targetIndex: 0,
          });
        } else {
          await setSequenceStepAction({
            dealId: cardId,
            step: columnId as SequenceStep,
            targetIndex: index,
          });
        }
        router.refresh();
      }}
    />
  );
}

export { SEQUENCE_STEP_LABELS };
