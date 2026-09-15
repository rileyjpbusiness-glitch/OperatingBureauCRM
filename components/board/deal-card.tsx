"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { updateDealAction } from "@/lib/actions";
import { SEQUENCE_STEP_CARD_LABELS } from "@/lib/db/enums";
import type { DealCard as DealCardModel } from "@/lib/repo/types";
import {
  contactName,
  formatDealValue,
  formatDueDate,
  isEstimatedValue,
  siltStyle,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import { OwnerChip } from "./owner-chip";
import { PriorityToggle } from "./priority-toggle";
import { SOURCE_LABELS, SourceIcon } from "./source-icon";

/**
 * Four lines, one badge, a flame, and a left edge that silts up as the deal
 * ages. The badge answers what you owe this person next: the next action date
 * if there is one, and only when nothing is scheduled does age take the slot.
 *
 * The flame is the one control on the card, and the only thing on it the
 * operator sets by hand rather than the board deriving it.
 */
export function DealCard({
  card,
  showStep = true,
}: {
  card: DealCardModel;
  /** Off on the sub-board, where the column already names the step. */
  showStep?: boolean;
}) {
  const router = useRouter();

  // Held here rather than in the button so the whole card changes colour under
  // the cursor, instead of the icon turning and the tint arriving a round trip
  // later. Dropped again once the server's answer agrees.
  const [optimistic, setOptimistic] = React.useState<boolean | null>(null);
  const hot = optimistic ?? card.priority;

  React.useEffect(() => {
    setOptimistic(null);
  }, [card.priority]);

  async function togglePriority() {
    const next = !hot;
    setOptimistic(next);
    try {
      await updateDealAction({ dealId: card.id, priority: next });
      router.refresh();
    } catch {
      // Whatever the server has is the truth; fall back to it.
      setOptimistic(null);
    }
  }

  const step = showStep ? card.sequenceStep : null;
  const org = card.contact.company ?? card.contact.instagramHandle;
  const showAge = card.nextActionAt === null && card.staleness !== "fresh";

  return (
    <article
      className={cn(
        "motion-fast rounded-card relative max-w-[var(--card-max-width)] overflow-hidden border px-3.5 py-3",
        // Flagged hot: the same card carrying a wash of the hot signal, not a
        // red box. The tint has to survive being read next to twenty others.
        hot
          ? "border-priority-border bg-priority-surface hover:bg-priority-surface-hover"
          : "border-hairline bg-surface-2 hover:bg-surface-3",
        card.status === "lost" && "opacity-55",
      )}
    >
      {/* Age silt: the bottleneck as texture, before you read a number. */}
      <span
        aria-hidden
        className="silt absolute inset-y-0 left-0 w-0.5"
        style={siltStyle(card.agePressure)}
      />

      <div className="flex items-start justify-between gap-2">
        <h3 className="text-text-1 truncate font-sans text-body font-medium">
          {contactName(card.contact)}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <PriorityToggle on={hot} onToggle={togglePriority} />
          <OwnerChip owner={card.owner} className="mt-px" />
        </div>
      </div>

      {org ? (
        <p
          className="text-text-2 mt-1 flex items-center gap-1.5 font-sans text-tiny"
          title={`${org} - ${SOURCE_LABELS[card.contact.source]}`}
        >
          <SourceIcon source={card.contact.source} />
          <span className="truncate">{org}</span>
        </p>
      ) : null}

      {/* Zero is an absence, not a value. */}
      {card.value > 0 ? (
        <p
          className={cn(
            "mt-2 font-mono text-data",
            // A rev-share figure is a guess, and muting it says so.
            isEstimatedValue(card.valueType) ? "text-text-2" : "text-text-1",
          )}
          title={
            isEstimatedValue(card.valueType) ? "Rev-share estimate" : undefined
          }
        >
          {formatDealValue(card.value, card.valueType)}
        </p>
      ) : null}

      {step || card.nextActionAt || showAge ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          {step ? (
            <span className="text-text-2 font-mono text-micro font-medium">
              {SEQUENCE_STEP_CARD_LABELS[step]}
            </span>
          ) : (
            <span />
          )}

          {card.nextActionAt ? (
            <span
              title={card.nextAction ?? "Next action"}
              className={cn(
                "shrink-0 font-mono text-micro font-medium tracking-badge uppercase",
                card.nextActionOverdue ? "text-signal-hot" : "text-text-3",
              )}
            >
              {formatDueDate(card.nextActionAt)}
            </span>
          ) : showAge ? (
            <span
              title="Past this stage's stale threshold"
              className={cn(
                "shrink-0 font-mono text-micro font-medium tracking-badge uppercase",
                card.staleness === "critical"
                  ? "text-signal-hot"
                  : "text-signal-warm",
              )}
            >
              {card.daysInStage}d
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
