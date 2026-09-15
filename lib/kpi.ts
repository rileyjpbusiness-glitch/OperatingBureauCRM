/**
 * The vocabulary of the KPI dashboard: which windows exist, which figures the
 * tiles show, and what each one means.
 *
 * Deliberately separate from lib/repo/kpi.ts, which computes them. These are
 * runtime values that client components need, and importing them from the repo
 * barrel would pull better-sqlite3 into the browser bundle. The repo layer is
 * server-only; anything the client needs at runtime lives out here.
 */

export const PERIODS = ["daily", "weekly", "monthly", "annually"] as const;
export type Period = (typeof PERIODS)[number];

export const KPI_METRICS = ["leads", "closed", "revenue", "conversion"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  annually: "Annually",
};

/** What the delta is measured against, spelled out rather than implied. */
export const PERIOD_COMPARISON: Record<Period, string> = {
  daily: "vs yesterday",
  weekly: "vs previous 7 days",
  monthly: "vs previous 30 days",
  annually: "vs previous year",
};

export const KPI_LABELS: Record<KpiMetric, string> = {
  leads: "Leads",
  closed: "Closed",
  revenue: "Revenue",
  conversion: "Conversion Rate",
};

/** What each figure actually counts, for the tile's title attribute. */
export const KPI_DEFINITIONS: Record<KpiMetric, string> = {
  leads: "Contacts created in this window",
  closed: "Deals that reached a won stage in this window",
  revenue: "New monthly recurring revenue from deals won in this window",
  conversion:
    "Deals won divided by deals that reached the closing stage, in this window",
};

export const KPI_FORMAT: Record<KpiMetric, "count" | "currency" | "percent"> = {
  leads: "count",
  closed: "count",
  revenue: "currency",
  conversion: "percent",
};

export type KpiReading = {
  metric: KpiMetric;
  current: number;
  previous: number;
  /** Null when there is no previous figure to compare against. */
  changeRatio: number | null;
};

export type ChartBucket = {
  label: string;
  start: Date;
  end: Date;
  values: Record<KpiMetric, number>;
};

/**
 * The one number the outbound operation is run against: builds sent per day.
 *
 * A build going out is a deal reaching the first step of the cadence. Everything
 * before it is preparation and everything after it depends on it, which is why
 * it is the figure with a target rather than leads created or calls booked.
 */
export const DAILY_BUILD_TARGET = 3;

/** How far back the daily strip looks. Two weeks reads at a glance. */
export const CADENCE_WINDOW_DAYS = 14;
