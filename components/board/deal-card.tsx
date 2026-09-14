import { SEQUENCE_STEP_LABELS } from "@/lib/db/enums";
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
import { SOURCE_LABELS, SourceIcon } from "./source-icon";

/**
 * Four lines, at most one badge, and a left edge that silts up as the deal
 * ages. The badge answers what you owe this person next: the next action date
 * if there is one, and only when nothing is scheduled does age take the slot.
 */
export function DealCard({
  card,
  showStep = true,
}: {
  card: DealCardModel;
  /** Off on the sub-board, where the column already names the step. */
  showStep?: boolean;
}) {
  const step = showStep ? card.sequenceStep : null;
  const org = card.contact.company ?? card.contact.instagramHandle;
  const showAge = card.nextActionAt === null && card.staleness !== "fresh";

  return (
    <article
      className={cn(
        "motion-fast border-hairline bg-surface-2 hover:bg-surface-3 rounded-card relative max-w-[var(--card-max-width)] overflow-hidden border px-3.5 py-3",
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
        <OwnerChip owner={card.owner} className="mt-px" />
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
              {SEQUENCE_STEP_LABELS[step]}
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
