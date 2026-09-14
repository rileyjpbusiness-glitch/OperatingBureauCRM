import { SEQUENCE_STEP_LABELS } from "@/lib/db/enums";
import type { DealCard as DealCardModel } from "@/lib/repo/types";
import {
  contactName,
  formatDealValue,
  formatDueDate,
  isEstimatedValue,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import { OwnerChip } from "./owner-chip";
import { SOURCE_LABELS, SourceIcon } from "./source-icon";

/**
 * Four lines, and at most one badge.
 *
 * The badge answers "what do I owe this person next" first: the next action
 * date if there is one. Only when there is nothing scheduled does age take the
 * slot, and only once it is past the stage's threshold. Two badges on every
 * card was noise.
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
        "bg-card hover:border-ring/60 rounded-md border px-2.5 py-2 transition-colors",
        card.status === "lost" && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-xs leading-tight font-medium">
          {contactName(card.contact)}
        </h3>
        <OwnerChip owner={card.owner} className="mt-px" />
      </div>

      {org ? (
        <p
          className="text-muted-foreground mt-1 flex items-center gap-1 text-[11px]"
          title={`${org} - ${SOURCE_LABELS[card.contact.source]}`}
        >
          <SourceIcon source={card.contact.source} />
          <span className="truncate">{org}</span>
        </p>
      ) : null}

      {/* Zero is an absence, not a value. A lead nobody has priced yet says
          nothing here rather than claiming to be worth $0. */}
      {card.value > 0 ? (
        <p
          className={cn(
            "mt-1.5 font-mono text-[11px] tabular-nums",
            // A rev-share figure is a guess, and muting it says so without
            // needing a suffix.
            isEstimatedValue(card.valueType) && "text-muted-foreground",
          )}
          title={
            isEstimatedValue(card.valueType) ? "Rev-share estimate" : undefined
          }
        >
          {formatDealValue(card.value, card.valueType)}
        </p>
      ) : null}

      {step || card.nextActionAt || showAge ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          {step ? (
            <span className="bg-secondary text-muted-foreground rounded px-1 py-px text-[10px]">
              {SEQUENCE_STEP_LABELS[step]}
            </span>
          ) : (
            <span />
          )}

          {card.nextActionAt ? (
            <span
              title={card.nextAction ?? "Next action"}
              className={cn(
                "shrink-0 text-[10px]",
                card.nextActionOverdue
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {formatDueDate(card.nextActionAt)}
            </span>
          ) : showAge ? (
            <span
              title="Past this stage's stale threshold"
              className={cn(
                "shrink-0 rounded px-1 py-px font-mono text-[10px] tabular-nums",
                card.staleness === "critical"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-warning/15 text-warning",
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
