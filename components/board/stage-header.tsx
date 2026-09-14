"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";

import type { StageWithMetrics } from "@/lib/repo/types";
import { formatCentsCompact, formatDays, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Name and count by default. The rest of the numbers are behind the Stats
 * toggle, because they are worth reading weekly and in the way daily.
 */
export function StageHeader({
  stage,
  isBottleneck,
  showStats,
  sequenceHref,
}: {
  stage: StageWithMetrics;
  isBottleneck: boolean;
  showStats: boolean;
  /** Set on the sequence stage, whose header opens the sub-board. */
  sequenceHref?: string;
}) {
  const { metrics } = stage;

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: stage.color }}
        />
        <h2 className="truncate text-[11px] font-semibold tracking-wide uppercase">
          {stage.name}
        </h2>
        {sequenceHref ? (
          <Maximize2 className="text-muted-foreground/70 size-3 shrink-0" />
        ) : null}

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* What this column owes you today. No badge when the answer is
              nothing, so a zero never competes for attention. */}
          {metrics.dueCount > 0 ? (
            <span className="bg-destructive/15 text-destructive rounded px-1 py-px font-mono text-[10px] tabular-nums">
              {metrics.dueCount} due
            </span>
          ) : null}
          <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
            {metrics.count}
          </span>
        </span>
      </div>

      {showStats ? (
        <div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
          <span>{formatCentsCompact(metrics.totalMonthlyRecurringCents)}</span>

          {metrics.conversionFromPrevious === null ? (
            <span className="text-muted-foreground/40">&mdash;</span>
          ) : (
            <span className={cn(isBottleneck && "text-warning font-semibold")}>
              {formatPercent(metrics.conversionFromPrevious)}
            </span>
          )}

          <span>
            {metrics.avgDaysInStage === null
              ? "—"
              : formatDays(metrics.avgDaysInStage)}
          </span>
        </div>
      ) : null}
    </>
  );

  const className = "rounded-t-md border-b px-2.5 py-2 bg-card/40";

  // The whole header is the target, not the icon: a 12px hit area is not a
  // control anyone finds twice.
  if (sequenceHref) {
    return (
      <Link
        href={sequenceHref}
        title="Open the follow-up sequence"
        className={cn(className, "hover:bg-accent/60 block transition-colors")}
      >
        {body}
      </Link>
    );
  }

  return <header className={className}>{body}</header>;
}
