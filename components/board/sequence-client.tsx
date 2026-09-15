"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  binDealAction,
  moveDealAction,
  setSequenceStepAction,
} from "@/lib/actions";
import { isDueOrOverdue } from "@/lib/dates";
import type { SequenceStep } from "@/lib/db/enums";
import type { SequenceBoard, Stage } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

import { DealCard } from "./deal-card";
import { Kanban, type KanbanColumn } from "./kanban";

const REPLIED_DROP_ID = "banner:replied";
const STORAGE_KEY = "bureau.collapsed.sequence";

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
  // One clock for the whole render, so every tick agrees with every other.
  const now = React.useMemo(() => new Date(), []);

  // No Answer only grows and is never read, so it gets the same rail treatment
  // as Won and Lost on the main board.
  const [collapsed, setCollapsed] = React.useState<string[]>(["no_answer"]);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCollapsed(
            parsed.filter((id): id is string => typeof id === "string"),
          );
        }
      }
    } catch {
      // A blocked or cleared store just means the default stands.
    }
  }, []);

  const toggle = React.useCallback((step: string) => {
    setCollapsed((current) => {
      const next = current.includes(step)
        ? current.filter((id) => id !== step)
        : [...current, step];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not worth failing the interaction over.
      }
      return next;
    });
  }, []);

  const cadence = board.columns.filter((column) => column.step !== "no_answer");
  const lastCadenceStep = cadence[cadence.length - 1]?.step;

  const columns: KanbanColumn[] = board.columns.map((column) => {
    const isNoAnswer = column.step === "no_answer";
    const hasDue = column.cards.some(
      (card) => card.status === "open" && isDueOrOverdue(card.nextActionAt, now),
    );

    return {
      id: column.step,
      railLabel: column.label,
      railCount: column.cards.length,
      collapsed: isNoAnswer && collapsed.includes(column.step),
      onRailClick: () => toggle(column.step),
      cards: column.cards,
      dimmed: isNoAnswer,
      header: (
        <div
          {...(isNoAnswer
            ? {
                onDoubleClick: () => toggle(column.step),
                title: "Double-click to collapse",
              }
            : {})}
          className="border-hairline relative flex h-11 items-center gap-2 border-b px-2.5"
        >
          {/*
            The rule. Each column draws its own segment, extended into the
            gutters either side so the segments meet and the nine columns read
            as one cadence rather than nine boxes. No Answer is off the track,
            so the line stops short of it.
          */}
          <span
            aria-hidden
            className="bg-hairline absolute top-1/2 h-px"
            style={{
              left: isNoAnswer
                ? "var(--column-gap)"
                : "calc(var(--column-gap) * -0.5)",
              right:
                column.step === lastCadenceStep
                  ? "var(--ruler-break)"
                  : isNoAnswer
                    ? "0"
                    : "calc(var(--column-gap) * -0.5)",
              display: isNoAnswer ? "none" : undefined,
            }}
          />
          <h2 className="bg-surface-1 text-text-3 relative truncate pr-1.5 font-mono text-micro font-semibold tracking-label uppercase">
            {column.label}
          </h2>
          <span className="bg-surface-1 text-text-2 relative ml-auto pl-1.5 font-mono text-micro">
            {column.cards.length}
          </span>
          {/*
            The tick, drawn last so it sits above the label's masking
            background. Warm where today's work is, so the rule shows you
            where to start before you read a card.
          */}
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 left-2.5 z-10 h-1.5 w-px",
              hasDue ? "bg-signal-warm" : "bg-text-3",
            )}
          />
        </div>
      ),
    };
  });

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
      onBin={async (cardId) => {
        await binDealAction({ dealId: cardId });
        router.refresh();
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
