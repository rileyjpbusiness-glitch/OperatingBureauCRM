"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { moveDealAction, setSequenceStepAction } from "@/lib/actions";
import type { SequenceStep } from "@/lib/db/enums";
import type { SequenceBoard, Stage } from "@/lib/repo/types";

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

  const columns: KanbanColumn[] = board.columns.map((column) => ({
    id: column.step,
    railLabel: column.label,
    railCount: column.cards.length,
    collapsed: column.step === "no_answer" && collapsed.includes(column.step),
    onRailClick: () => toggle(column.step),
    cards: column.cards,
    dimmed: column.step === "no_answer",
    header: (
      <div
        {...(column.step === "no_answer"
          ? {
              onDoubleClick: () => toggle(column.step),
              title: "Double-click to collapse",
            }
          : {})}
        className="bg-card/40 flex items-center gap-1.5 rounded-t-md border-b px-2.5 py-2"
      >
        <h2 className="truncate text-[11px] font-semibold tracking-wide uppercase">
          {column.label}
        </h2>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {column.cards.length}
        </span>
      </div>
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
