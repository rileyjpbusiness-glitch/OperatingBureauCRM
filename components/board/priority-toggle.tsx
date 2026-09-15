"use client";

import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The flame itself. It holds no state: the card owns whether this deal is hot,
 * so the tint and the icon can never disagree with each other.
 *
 * It sits inside a card that is both draggable and clickable, so it has to
 * claim the pointer before either of those does: dnd-kit starts a drag on
 * pointerdown, and the card opens the detail panel on click.
 */
export function PriorityToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-pressed={on}
      aria-label={on ? "Clear hot" : "Mark hot"}
      title={on ? "Hot. Click to clear." : "Mark hot"}
      className={cn(
        "motion-fast rounded-control flex size-5 shrink-0 items-center justify-center outline-none",
        on ? "text-signal-hot" : "text-text-3 hover:text-signal-hot",
      )}
    >
      <Flame
        strokeWidth={1.25}
        className={cn("size-[var(--icon-size)]", on && "fill-current")}
      />
    </button>
  );
}
