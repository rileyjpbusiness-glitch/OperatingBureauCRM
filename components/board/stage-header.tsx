"use client";

import Link from "next/link";

import type { StageWithMetrics } from "@/lib/repo/types";
import { formatCentsCompact, formatDays, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Two lines, always, so a stage name can never be truncated by whatever else
 * the header happens to be carrying. Name and count on the first; the due
 * badge and, in Stats mode, the numbers on the second.
 *
 * A column's position is its identity, so there is no colour marker.
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
  const hasSecondLine = showStats || metrics.dueCount > 0;

  const dueBadge =
    metrics.dueCount > 0 ? (
      <span className="text-signal-warm font-mono text-micro font-medium tracking-badge uppercase">
        {metrics.dueCount} due
      </span>
    ) : null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className={cn(
            "motion-fast truncate font-mono text-micro font-semibold tracking-label uppercase",
            // The only affordance on the link: the name lifts on hover.
            sequenceHref ? "text-text-3 group-hover:text-text-1" : "text-text-3",
          )}
        >
          {stage.name}
        </h2>
        <span className="text-text-2 shrink-0 font-mono text-micro">
          {metrics.count}
        </span>
      </div>

      {hasSecondLine ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-micro">
          {showStats ? (
            <>
              <span className="text-text-2">
                {formatCentsCompact(metrics.totalMonthlyRecurringCents)}
              </span>
              <span
                className={cn(
                  isBottleneck
                    ? "text-signal-warm font-semibold"
                    : "text-text-3",
                )}
              >
                {metrics.conversionFromPrevious === null
                  ? "—"
                  : formatPercent(metrics.conversionFromPrevious)}
              </span>
              <span className="text-text-3">
                {metrics.avgDaysInStage === null
                  ? "—"
                  : formatDays(metrics.avgDaysInStage)}
              </span>
              {dueBadge}
            </>
          ) : (
            dueBadge
          )}
        </div>
      ) : null}
    </>
  );

  const shell = "border-hairline border-b px-2.5 py-2.5";

  if (sequenceHref) {
    return (
      <Link
        href={sequenceHref}
        title="Open the follow-up sequence"
        className={cn(shell, "group block outline-none")}
      >
        {body}
      </Link>
    );
  }

  return <header className={shell}>{body}</header>;
}
