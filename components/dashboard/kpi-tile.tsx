"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import {
  KPI_DEFINITIONS,
  KPI_FORMAT,
  KPI_LABELS,
  type KpiMetric,
  type KpiReading,
} from "@/lib/kpi";
import { formatCents, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function formatKpi(metric: KpiMetric, value: number): string {
  switch (KPI_FORMAT[metric]) {
    case "currency":
      return formatCents(value);
    case "percent":
      return formatPercent(value);
    case "count":
      return value.toLocaleString("en-US");
  }
}

/**
 * A reading plus its movement. Selecting one retargets the chart below, so the
 * tiles are the chart's control rather than four numbers sitting next to it.
 */
export function KpiTile({
  reading,
  comparison,
  selected,
}: {
  reading: KpiReading;
  comparison: string;
  selected: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const { metric, current, previous, changeRatio } = reading;
  const rising = changeRatio !== null && changeRatio > 0;
  const falling = changeRatio !== null && changeRatio < 0;

  function select() {
    const query = new URLSearchParams(params.toString());
    if (metric === "leads") query.delete("metric");
    else query.set("metric", metric);
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={select}
      aria-pressed={selected}
      title={KPI_DEFINITIONS[metric]}
      className={cn(
        "motion-fast border-hairline block px-4 py-4 text-left outline-none",
        "border-l [&:nth-child(odd)]:border-l-0 [&:nth-child(n+3)]:border-t",
        "wide:[&:nth-child(odd)]:border-l wide:first:border-l-0 wide:[&:nth-child(n+3)]:border-t-0",
        selected ? "bg-surface-1" : "hover:bg-surface-1/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "motion-fast font-mono text-micro font-medium tracking-label uppercase",
            selected ? "text-text-1" : "text-text-3",
          )}
        >
          {KPI_LABELS[metric]}
        </span>

        {/* Flat is flat: an arrow on a 0% change points somewhere it did not
            move. Direction is carried by the glyph as well as the colour. */}
        {changeRatio === null ? null : (
          <span
            className={cn(
              "flex items-center gap-0.5 font-mono text-micro font-medium",
              rising
                ? "text-signal-good"
                : falling
                  ? "text-signal-hot"
                  : "text-text-3",
            )}
          >
            {rising ? (
              <ArrowUpRight strokeWidth={1.5} className="size-3" />
            ) : falling ? (
              <ArrowDownRight strokeWidth={1.5} className="size-3" />
            ) : (
              <Minus strokeWidth={1.5} className="size-3" />
            )}
            {formatPercent(Math.abs(changeRatio))}
          </span>
        )}
      </div>

      <p className="text-text-1 mt-2 font-serif text-figure leading-none">
        {formatKpi(metric, current)}
      </p>

      <p className="text-text-3 mt-3 font-mono text-micro">
        from {formatKpi(metric, previous)}{" "}
        <span className="text-text-3/70">{comparison}</span>
      </p>
    </button>
  );
}
