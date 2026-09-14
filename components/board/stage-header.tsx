"use client";

import Link from "next/link";
import { Maximize2, TrendingDown } from "lucide-react";

import type { StageWithMetrics } from "@/lib/repo/types";
import { formatCentsCompact, formatDays, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Name and count by default. The rest of the numbers are behind the Stats
 * toggle, because they are worth reading weekly and in the way daily.
 */
export function StageHeader({
  stage,
  previousStageName,
  isBottleneck,
  showStats,
  sequenceHref,
}: {
  stage: StageWithMetrics;
  previousStageName: string | null;
  isBottleneck: boolean;
  showStats: boolean;
  /** Set on the sequence stage, whose header opens the sub-board. */
  sequenceHref?: string;
}) {
  const { metrics } = stage;

  const title = (
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
        <Maximize2 className="text-muted-foreground size-3 shrink-0" />
      ) : null}
      <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
        {metrics.count}
      </span>
    </div>
  );

  return (
    <header
      className={cn(
        "rounded-t-md border-b px-2.5 py-2",
        isBottleneck ? "bg-warning/5 border-b-warning/40" : "bg-card/40",
      )}
      title={
        isBottleneck ? "Worst converting step in this pipeline" : undefined
      }
    >
      {sequenceHref ? (
        <Link
          href={sequenceHref}
          className="hover:text-foreground block outline-none"
          title="Open the follow-up sequence"
        >
          {title}
        </Link>
      ) : (
        title
      )}

      {showStats ? (
        <div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums">
          <span title="Total monthly recurring value in this stage">
            {formatCentsCompact(metrics.totalMonthlyRecurringCents)}
          </span>

          {metrics.conversionFromPrevious === null ? (
            <span className="text-muted-foreground/40">&mdash;</span>
          ) : (
            <span
              title={`${metrics.everReached} of the deals that reached ${previousStageName} went on to reach ${stage.name} or later`}
              className={cn(
                "flex items-center gap-0.5",
                isBottleneck && "text-warning font-semibold",
              )}
            >
              {isBottleneck ? <TrendingDown className="size-3" /> : null}
              {formatPercent(metrics.conversionFromPrevious)}
            </span>
          )}

          <span title="Average time the deals here have been in this stage">
            {metrics.avgDaysInStage === null
              ? "—"
              : formatDays(metrics.avgDaysInStage)}
          </span>
        </div>
      ) : null}
    </header>
  );
}
