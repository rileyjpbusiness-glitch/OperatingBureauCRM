"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RotateCw } from "lucide-react";

import { PERIODS, PERIOD_LABELS, type Period } from "@/lib/kpi";
import { cn } from "@/lib/utils";

/**
 * The window every figure on the page is measured over. In the query string, so
 * a view of the numbers can be sent to someone else.
 */
export function PeriodToggle({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [refreshing, startRefresh] = React.useTransition();

  function select(next: Period) {
    const query = new URLSearchParams(params.toString());
    if (next === "weekly") query.delete("period");
    else query.set("period", next);
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex items-center gap-1">
      {PERIODS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => select(option)}
          className={cn(
            "motion-fast rounded-control px-2 py-1 font-mono text-micro tracking-label uppercase outline-none",
            option === period
              ? "bg-surface-3 text-text-1"
              : "text-text-3 hover:text-text-1",
          )}
        >
          {PERIOD_LABELS[option]}
        </button>
      ))}

      <button
        type="button"
        onClick={() => startRefresh(() => router.refresh())}
        disabled={refreshing}
        title="Recompute from the database"
        className="motion-fast rounded-control text-text-3 hover:text-text-1 ml-1 flex items-center gap-1.5 px-2 py-1 font-mono text-micro tracking-label uppercase outline-none disabled:opacity-50"
      >
        <RotateCw strokeWidth={1} className="size-3" />
        {refreshing ? "Refreshing" : "Refresh"}
      </button>
    </div>
  );
}
