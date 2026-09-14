import { CalendarClock } from "lucide-react";

import type { DealCard as DealCardModel, Staleness } from "@/lib/repo/types";
import { contactName, formatDealValue, formatDueDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { OwnerChip } from "./owner-chip";
import { SOURCE_LABELS, SourceIcon } from "./source-icon";

/**
 * Amber once a deal has sat longer than its stage allows, red past double
 * that. Stages with no threshold never colour.
 */
const AGE_TONE: Record<Staleness, string> = {
  fresh: "bg-secondary text-muted-foreground",
  stale: "bg-warning/15 text-warning",
  critical: "bg-destructive/15 text-destructive",
};

const AGE_TITLE: Record<Staleness, string> = {
  fresh: "Days in this stage",
  stale: "Past this stage's stale threshold",
  critical: "More than double this stage's stale threshold",
};

export function DealCard({ card }: { card: DealCardModel }) {
  const org = card.contact.company ?? card.contact.instagramHandle;

  return (
    <article
      className={cn(
        "bg-card hover:border-ring/60 group rounded-md border px-2.5 py-2 transition-colors",
        card.status === "lost" && "opacity-60",
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

      <p className="mt-1.5 font-mono text-[11px] tabular-nums">
        {formatDealValue(card.value, card.valueType)}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          title={AGE_TITLE[card.staleness]}
          className={cn(
            "rounded px-1 py-px font-mono text-[10px] tabular-nums",
            AGE_TONE[card.staleness],
          )}
        >
          {card.daysInStage}d
        </span>

        {card.nextActionAt ? (
          <span
            title={card.nextAction ?? "Next action"}
            className={cn(
              "flex items-center gap-1 text-[10px]",
              card.nextActionOverdue
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            <CalendarClock className="size-3" />
            {formatDueDate(card.nextActionAt)}
          </span>
        ) : null}
      </div>
    </article>
  );
}
