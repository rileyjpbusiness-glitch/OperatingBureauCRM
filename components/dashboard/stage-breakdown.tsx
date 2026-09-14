import Link from "next/link";

import type { StageWithMetrics } from "@/lib/repo/types";
import { formatCentsCompact, formatDays, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Where every lead currently sits, and what each stage is worth. The share bar
 * is the same reading as the count, drawn, so the shape of the pipeline is
 * legible without comparing eight numbers.
 */
export function StageBreakdown({
  stages,
  openTotal,
  slug,
  bottleneckStageId,
}: {
  stages: StageWithMetrics[];
  openTotal: number;
  slug: string;
  bottleneckStageId: string | null;
}) {
  return (
    <section className="border-hairline bg-surface-1 rounded-card border">
      <div className="border-hairline flex items-baseline justify-between gap-4 border-b px-4 py-3">
        <h2 className="text-text-3 font-mono text-micro font-medium tracking-label uppercase">
          Pipeline stages
        </h2>
        <p className="text-text-3 font-mono text-micro">{openTotal} open</p>
      </div>

      <ul>
        {stages.map((stage) => {
          const { metrics } = stage;
          const terminal = stage.isWon || stage.isLost;
          const share =
            terminal || openTotal === 0 ? 0 : metrics.count / openTotal;

          return (
            <li key={stage.id} className="border-hairline-soft border-b last:border-b-0">
              <Link
                href={`/pipeline/${slug}`}
                className="motion-fast hover:bg-surface-2 flex items-center gap-4 px-4 py-2.5 outline-none"
              >
                <span className="text-text-2 w-28 shrink-0 truncate font-mono text-micro tracking-label uppercase">
                  {stage.name}
                </span>

                <span className="text-text-1 w-8 shrink-0 text-right font-mono text-data">
                  {metrics.count}
                </span>

                {/* The count again, as a length. Terminal stages are not part
                    of the open pipeline, so they get no bar. */}
                <span className="bg-surface-2 rounded-control h-1.5 min-w-0 flex-1 overflow-hidden">
                  <span
                    className="bg-text-2 block h-full rounded-control"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </span>

                <span className="text-text-3 w-10 shrink-0 text-right font-mono text-micro">
                  {terminal ? "" : formatPercent(share)}
                </span>

                <span className="text-text-2 w-16 shrink-0 text-right font-mono text-micro">
                  {formatCentsCompact(metrics.totalMonthlyRecurringCents)}
                </span>

                <span
                  className={cn(
                    "w-16 shrink-0 text-right font-mono text-micro",
                    bottleneckStageId === stage.id
                      ? "text-signal-warm font-semibold"
                      : "text-text-3",
                  )}
                >
                  {metrics.conversionFromPrevious === null
                    ? "—"
                    : formatPercent(metrics.conversionFromPrevious)}
                </span>

                <span className="text-text-3 w-12 shrink-0 text-right font-mono text-micro">
                  {metrics.avgDaysInStage === null
                    ? "—"
                    : formatDays(metrics.avgDaysInStage)}
                </span>

                <span className="w-14 shrink-0 text-right">
                  {metrics.dueCount > 0 ? (
                    <span className="text-signal-warm font-mono text-micro font-medium tracking-badge uppercase">
                      {metrics.dueCount} due
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
