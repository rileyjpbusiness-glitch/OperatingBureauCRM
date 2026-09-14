"use client";

import * as React from "react";

import {
  KPI_DEFINITIONS,
  KPI_LABELS,
  type ChartBucket,
  type KpiMetric,
} from "@/lib/kpi";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { formatKpi } from "./kpi-tile";

/**
 * One series, so the heading names it and there is no legend to read.
 *
 * Bars are neutral by default and only the one under the cursor takes colour:
 * amber means "needs attention" everywhere else in this interface, and thirty
 * amber bars would spend that meaning on decoration.
 */
export function PerformanceChart({
  series,
  metric,
}: {
  series: ChartBucket[];
  metric: KpiMetric;
}) {
  const [hovered, setHovered] = React.useState<number | null>(null);

  const values = series.map((bucket) => bucket.values[metric]);
  const peak = Math.max(...values, 0);

  // Enough room for a label without them colliding: roughly one every 90px.
  const stride = Math.max(1, Math.ceil(series.length / 10));

  const active = hovered === null ? null : series[hovered];
  const activeValue = hovered === null ? 0 : (values[hovered] ?? 0);
  const activePrevious = hovered === null ? undefined : values[hovered - 1];
  const step =
    activePrevious === undefined || activePrevious === 0
      ? null
      : (activeValue - activePrevious) / activePrevious;

  return (
    <section className="border-hairline bg-surface-1 rounded-card border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          className="text-text-3 font-mono text-micro font-medium tracking-label uppercase"
          title={KPI_DEFINITIONS[metric]}
        >
          {KPI_LABELS[metric]} over time
        </h2>
        <p className="text-text-3 font-mono text-micro">
          {series.length} {series.length > 12 ? "days" : "periods"}
        </p>
      </div>

      <div className="mt-5 flex gap-3">
        {/* A recessive scale: three readings, not a ruled grid. */}
        <div className="text-text-3 flex h-44 w-10 shrink-0 flex-col justify-between text-right font-mono text-micro">
          <span>{formatKpi(metric, peak)}</span>
          <span>{formatKpi(metric, peak / 2)}</span>
          <span>{formatKpi(metric, 0)}</span>
        </div>

        <div className="relative min-w-0 flex-1">
          <div
            className="flex h-44 items-end gap-0.5"
            onMouseLeave={() => setHovered(null)}
          >
            {series.map((bucket, index) => {
              const value = values[index] ?? 0;
              const height = peak === 0 ? 0 : (value / peak) * 100;
              const isHovered = hovered === index;

              return (
                <div
                  key={bucket.start.toISOString()}
                  onMouseEnter={() => setHovered(index)}
                  className="group relative flex h-full min-w-0 flex-1 items-end"
                >
                  {/* Full-height track: the hit target is the whole column,
                      not the few pixels the bar happens to occupy. */}
                  <div
                    className={cn(
                      "motion-fast absolute inset-0 rounded-t-control",
                      isHovered ? "bg-surface-3" : "bg-surface-2",
                    )}
                  />
                  <div
                    className={cn(
                      "motion-fast rounded-t-control relative w-full",
                      isHovered ? "bg-signal-warm" : "bg-text-2",
                    )}
                    style={{ height: `${Math.max(height, value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="text-text-3 mt-2 flex gap-0.5 font-mono text-micro">
            {series.map((bucket, index) => (
              <span
                key={bucket.start.toISOString()}
                className="min-w-0 flex-1 truncate text-center"
              >
                {index % stride === 0 ? bucket.label : ""}
              </span>
            ))}
          </div>

          {active ? (
            <div
              className="border-hairline bg-surface-2 rounded-card pointer-events-none absolute top-0 z-20 w-44 border px-3 py-2.5"
              style={{
                left: `${((hovered! + 0.5) / series.length) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              <p className="text-text-1 font-sans text-tiny">{active.label}</p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="text-text-3 font-mono text-micro tracking-badge uppercase">
                  {KPI_LABELS[metric]}
                </span>
                <span className="text-text-1 font-mono text-data">
                  {formatKpi(metric, activeValue)}
                </span>
              </div>
              {step === null ? null : (
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="text-text-3 font-mono text-micro tracking-badge uppercase">
                    Step
                  </span>
                  <span
                    className={cn(
                      "font-mono text-micro font-medium",
                      step > 0
                        ? "text-signal-good"
                        : step < 0
                          ? "text-signal-hot"
                          : "text-text-3",
                    )}
                  >
                    {step > 0 ? "+" : step < 0 ? "-" : ""}
                    {formatPercent(Math.abs(step))}
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
