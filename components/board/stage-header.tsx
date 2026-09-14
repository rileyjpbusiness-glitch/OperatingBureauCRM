"use client";

import { TrendingDown } from "lucide-react";

import type { StageWithMetrics } from "@/lib/repo/types";
import {
  formatCentsCompact,
  formatDays,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The header is the reason this board exists: four live numbers per stage, and
 * a flag on the step converting worst. Each number explains itself on hover,
 * because a metric you cannot interrogate is a metric you stop trusting.
 */
export function StageHeader({
  stage,
  previousStageName,
  isBottleneck,
}: {
  stage: StageWithMetrics;
  previousStageName: string | null;
  isBottleneck: boolean;
}) {
  const { metrics } = stage;

  return (
    <header
      className={cn(
        "rounded-t-md border-b px-2.5 py-2",
        isBottleneck ? "bg-warning/5 border-b-warning/40" : "bg-card/40",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: stage.color }}
        />
        <h2 className="truncate text-[11px] font-semibold tracking-wide uppercase">
          {stage.name}
        </h2>
        <span className="text-muted-foreground ml-auto font-mono text-[11px] tabular-nums">
          {metrics.count}
        </span>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="mt-1.5 w-fit cursor-default">
            <p className="font-mono text-sm leading-none tabular-nums">
              {formatCentsCompact(metrics.totalAnnualizedCents)}
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-[10px] tabular-nums">
              {formatCentsCompact(metrics.totalMonthlyRecurringCents)} MRR
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Annualized contract value of the {metrics.count}{" "}
          {metrics.count === 1 ? "deal" : "deals"} in this stage. Monthly and
          rev-share values count twelve times; one-time values count once.
        </TooltipContent>
      </Tooltip>

      <div className="mt-2 flex items-center justify-between gap-2">
        {metrics.conversionFromPrevious === null ? (
          previousStageName === null && !stage.isLost ? (
            <span className="text-muted-foreground/60 text-[10px]">
              entry stage
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground/40 cursor-default font-mono text-[10px]">
                  &mdash;
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {stage.isLost
                  ? "Lost sits outside the funnel, so it has no conversion rate. Deals that end here still count toward the stages they passed through on the way."
                  : `Not enough history yet. A rate appears once at least five deals have reached ${previousStageName}.`}
              </TooltipContent>
            </Tooltip>
          )
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "flex cursor-default items-center gap-1 font-mono text-[10px] tabular-nums",
                  isBottleneck ? "text-warning font-semibold" : "text-muted-foreground",
                )}
              >
                {isBottleneck ? <TrendingDown className="size-3" /> : null}
                {formatPercent(metrics.conversionFromPrevious)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {metrics.everReached} of the deals that reached{" "}
              <strong>{previousStageName}</strong> went on to reach{" "}
              <strong>{stage.name}</strong> or later.
              {isBottleneck ? (
                <>
                  {" "}
                  This is the worst converting step in the pipeline.
                </>
              ) : null}
            </TooltipContent>
          </Tooltip>
        )}

        {metrics.avgDaysInStage === null ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground cursor-default font-mono text-[10px] tabular-nums">
                {formatDays(metrics.avgDaysInStage)} avg
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Average time the deals currently in this stage have been sitting
              here.
              {stage.staleAfterDays === null
                ? " This stage has no stale threshold."
                : ` Cards turn amber past ${stage.staleAfterDays}d and red past ${stage.staleAfterDays * 2}d.`}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
