"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { DealCard } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

/**
 * Rect-based detection compares the dragged card's box against each target, so
 * a 240px card can never "reach" a 48px rail or a 36px banner however precisely
 * you aim. Going by the pointer first makes small targets hittable, with rect
 * intersection as the fallback for when the cursor is over nothing.
 */
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : rectIntersection(args);
};

export type KanbanColumn = {
  id: string;
  header: React.ReactNode;
  cards: DealCard[];
  /** Renders as a narrow vertical rail instead of a column. */
  collapsed?: boolean;
  /** Shown along the rail when collapsed. */
  railLabel?: string;
  railCount?: number;
  onRailClick?: () => void;
  dimmed?: boolean;
};

/**
 * A full-width drop target above the columns. The sub-board uses it to pull a
 * deal out of the cadence and into Replied in one gesture.
 */
export type KanbanBanner = {
  id: string;
  label: string;
};

function SortableCard({
  card,
  children,
  onOpen,
}: {
  card: DealCard;
  children: React.ReactNode;
  onOpen: (dealId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { cardId: card.id } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("motion-settle touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(card.id);
        }
      }}
    >
      {children}
    </div>
  );
}

function Column({
  column,
  live,
  renderCard,
  onOpen,
}: {
  column: KanbanColumn;
  /** Header content from the server's copy, so counts stay fresh mid-drag. */
  live: KanbanColumn;
  renderCard: (card: DealCard) => React.ReactNode;
  onOpen: (dealId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id },
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={live.railLabel}
      className={cn(
        // Columns share the width so the board fits without scrolling; below
        // the floor they stop shrinking and the board scrolls.
        "motion-base border-hairline bg-surface-1 rounded-card flex h-full min-w-[var(--column-min-width)] flex-1 flex-col border",
        // The receiving column lifts. No dashed outline, no fill colour.
        isOver && "bg-surface-2 border-text-3",
        live.dimmed && "opacity-70",
      )}
    >
      {live.header}

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-2.5">
        <SortableContext
          items={column.cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.cards.length === 0 ? (
            <p className="text-text-3 px-1 py-3 text-center font-mono text-micro">
              empty
            </p>
          ) : (
            column.cards.map((card) => (
              <SortableCard key={card.id} card={card} onOpen={onOpen}>
                {renderCard(card)}
              </SortableCard>
            ))
          )}
        </SortableContext>
      </div>
    </section>
  );
}

function Rail({ column }: { column: KanbanColumn }) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { columnId: column.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={column.onRailClick}
      title={`Expand ${column.railLabel ?? ""}`}
      className={cn(
        "motion-base border-hairline bg-surface-1 hover:bg-surface-2 rounded-card flex h-full w-12 shrink-0 cursor-pointer flex-col items-center gap-2 border py-2.5 outline-none",
        isOver && "bg-surface-2 border-text-3",
      )}
    >
      <span className="text-text-2 font-mono text-micro">
        {column.railCount}
      </span>
      <span
        className="text-text-3 font-mono text-micro font-semibold tracking-label uppercase"
        style={{ writingMode: "vertical-rl" }}
      >
        {column.railLabel}
      </span>
    </button>
  );
}

function Banner({ banner }: { banner: KanbanBanner }) {
  const { setNodeRef, isOver } = useDroppable({
    id: banner.id,
    data: { columnId: banner.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "motion-base border-hairline rounded-card flex h-9 shrink-0 items-center justify-center border font-mono text-micro tracking-badge uppercase",
        isOver ? "bg-surface-2 border-text-3 text-text-1" : "text-text-3",
      )}
    >
      {banner.label}
    </div>
  );
}

/** The id the header's bin slot registers under, shared with the board below. */
export const BIN_DROPPABLE_ID = "__bin__";

/**
 * The bin lives in the top bar, above the board, but a droppable has to sit
 * inside the drag context. A portal resolves that: this element is a React
 * child of the board, so dnd-kit sees it, while its DOM node sits in the
 * header next to the theme toggle.
 *
 * It never takes the pointer. dnd-kit decides what is under the cursor from
 * measured rectangles rather than hit-testing, so pointer-events-none keeps the
 * bin button underneath clickable while this still works as a target.
 */
function BinDropTarget() {
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: BIN_DROPPABLE_ID });

  // The header renders on the same pass, so the node is there by the time
  // effects run, but not while this first renders.
  React.useEffect(() => {
    setSlot(document.getElementById("bin-drop-slot"));
  }, []);

  if (!slot) return null;

  return createPortal(
    <span
      ref={setNodeRef}
      aria-hidden
      className={cn(
        "motion-fast pointer-events-none absolute -inset-1 rounded-control border",
        isOver ? "border-signal-hot bg-signal-hot/15" : "border-transparent",
      )}
    />,
    slot,
  );
}

export function Kanban({
  id,
  columns,
  banner,
  renderCard,
  renderDragCard,
  onOpen,
  onMove,
  onBin,
}: {
  /**
   * Seeds dnd-kit's generated accessibility ids. Without it the counter starts
   * from a different number on the server than in the browser and React
   * reports a hydration mismatch on every card.
   */
  id: string;
  columns: KanbanColumn[];
  banner?: KanbanBanner;
  renderCard: (card: DealCard) => React.ReactNode;
  renderDragCard: (card: DealCard) => React.ReactNode;
  onOpen: (dealId: string) => void;
  /** Persists a drop. Throwing rolls the board back to the server's version. */
  onMove: (input: {
    cardId: string;
    columnId: string;
    index: number;
  }) => Promise<void>;
  /** Dropped on the bin. Same contract: throwing puts the card back. */
  onBin?: (cardId: string) => Promise<void>;
}) {
  // The server's columns are the source of truth; this copy is what the board
  // renders so a drop looks instant. It resyncs whenever the server sends a
  // different arrangement.
  const signature = React.useMemo(
    () =>
      columns
        .map((column) => `${column.id}:${column.cards.map((c) => c.id).join(",")}`)
        .join("|"),
    [columns],
  );
  const [local, setLocal] = React.useState(columns);
  const lastSignature = React.useRef(signature);

  React.useEffect(() => {
    if (lastSignature.current !== signature) {
      lastSignature.current = signature;
      setLocal(columns);
    }
  }, [signature, columns]);

  // Keep header content fresh even while a local arrangement is pending.
  const headers = React.useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  const [dragging, setDragging] = React.useState<DealCard | null>(null);

  const sensors = useSensors(
    // Without a small threshold every click would register as a drag and the
    // card would never open.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const findColumn = (list: KanbanColumn[], cardId: string) =>
    list.find((column) => column.cards.some((card) => card.id === cardId));

  const columnIdFor = (list: KanbanColumn[], overId: string) =>
    list.some((column) => column.id === overId)
      ? overId
      : (findColumn(list, overId)?.id ?? (banner?.id === overId ? overId : null));

  function handleDragStart(event: DragStartEvent) {
    const card = findColumn(local, String(event.active.id))?.cards.find(
      (candidate) => candidate.id === String(event.active.id),
    );
    setDragging(card ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const overId = String(over.id);
    if (banner && overId === banner.id) return;
    if (overId === BIN_DROPPABLE_ID) return;

    setLocal((current) => {
      const from = findColumn(current, cardId);
      const toId = columnIdFor(current, overId);
      if (!from || !toId || from.id === toId) return current;

      const card = from.cards.find((candidate) => candidate.id === cardId);
      if (!card) return current;

      return current.map((column) => {
        if (column.id === from.id) {
          return {
            ...column,
            cards: column.cards.filter((candidate) => candidate.id !== cardId),
          };
        }
        if (column.id === toId) {
          const overIndex = column.cards.findIndex(
            (candidate) => candidate.id === overId,
          );
          const next = [...column.cards];
          next.splice(overIndex === -1 ? next.length : overIndex, 0, card);
          return { ...column, cards: next };
        }
        return column;
      });
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDragging(null);
    if (!over) return;

    const cardId = String(active.id);
    const overId = String(over.id);

    if (overId === BIN_DROPPABLE_ID) {
      if (!onBin) return;
      const previous = local;
      setLocal((current) =>
        current.map((column) => ({
          ...column,
          cards: column.cards.filter((candidate) => candidate.id !== cardId),
        })),
      );
      try {
        await onBin(cardId);
      } catch {
        setLocal(previous);
      }
      return;
    }

    if (banner && overId === banner.id) {
      const previous = local;
      setLocal((current) =>
        current.map((column) => ({
          ...column,
          cards: column.cards.filter((candidate) => candidate.id !== cardId),
        })),
      );
      try {
        await onMove({ cardId, columnId: banner.id, index: 0 });
      } catch {
        setLocal(previous);
      }
      return;
    }

    const targetId = columnIdFor(local, overId);
    if (!targetId) return;

    const previous = local;
    let index = 0;

    const next = local.map((column) => {
      if (column.id !== targetId) return column;
      const current = column.cards.findIndex(
        (candidate) => candidate.id === cardId,
      );
      const overIndex = column.cards.findIndex(
        (candidate) => candidate.id === overId,
      );
      if (current === -1) return column;

      const destination = overIndex === -1 ? column.cards.length - 1 : overIndex;
      const reordered = [...column.cards];
      const [moved] = reordered.splice(current, 1);
      if (moved) reordered.splice(destination, 0, moved);
      index = destination;
      return { ...column, cards: reordered };
    });

    setLocal(next);

    try {
      await onMove({ cardId, columnId: targetId, index });
    } catch {
      setLocal(previous);
    }
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex h-full flex-col gap-[var(--column-gap)] p-[var(--column-gap)]">
        {banner ? <Banner banner={banner} /> : null}

        <div className="scrollbar-thin flex min-h-0 flex-1 gap-[var(--column-gap)] overflow-x-auto overflow-y-hidden">
          {local.map((column) => {
            const live = headers.get(column.id) ?? column;
            if (live.collapsed) {
              return (
                <Rail key={column.id} column={{ ...live, cards: column.cards }} />
              );
            }
            return (
              <Column
                key={column.id}
                column={column}
                live={live}
                renderCard={renderCard}
                onOpen={onOpen}
              />
            );
          })}
        </div>
      </div>

      {onBin ? <BinDropTarget /> : null}

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="drag-lift w-[var(--card-max-width)]">
            {renderDragCard(dragging)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
