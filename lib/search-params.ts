import type { Owner } from "@/lib/db/enums";
import { OWNERS } from "@/lib/db/enums";
import {
  KPI_METRICS,
  PERIODS,
  type KpiMetric,
  type Period,
} from "@/lib/repo/kpi";
import type { DealFilters } from "@/lib/repo/types";

export type PageSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isOwner(value: string | undefined): value is Owner {
  return value !== undefined && (OWNERS as readonly string[]).includes(value);
}

/** The board's whole view state lives in the query string. */
export function readViewState(params: PageSearchParams): {
  filters: DealFilters;
  showStats: boolean;
  dealId: string | null;
} {
  const search = one(params["q"]);
  const owner = one(params["owner"]);

  return {
    filters: {
      ...(search ? { search } : {}),
      ...(isOwner(owner) ? { owner } : {}),
    },
    showStats: one(params["stats"]) === "1",
    dealId: one(params["deal"]) ?? null,
  };
}

const PERIOD_VALUES = PERIODS as readonly string[];
const METRIC_VALUES = KPI_METRICS as readonly string[];

/** The dashboard's view state: which window, and which figure the chart plots. */
export function readDashboardState(params: PageSearchParams): {
  period: Period;
  metric: KpiMetric;
} {
  const period = one(params["period"]);
  const metric = one(params["metric"]);
  return {
    period: PERIOD_VALUES.includes(period ?? "") ? (period as Period) : "weekly",
    metric: METRIC_VALUES.includes(metric ?? "")
      ? (metric as KpiMetric)
      : "leads",
  };
}
