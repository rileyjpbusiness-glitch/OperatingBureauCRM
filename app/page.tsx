import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SourceIcon } from "@/components/board/source-icon";
import { OwnerChip } from "@/components/board/owner-chip";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { PeriodToggle } from "@/components/dashboard/period-toggle";
import { StageBreakdown } from "@/components/dashboard/stage-breakdown";
import {
  contactName,
  formatDealValue,
  formatDueDate,
} from "@/lib/format";
import {
  KPI_METRICS,
  PERIOD_COMPARISON,
  getBoard,
  getDashboard,
  getKpiDashboard,
  listPipelines,
  listStages,
} from "@/lib/repo";
import { readDashboardState, type PageSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bureau" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const { period, metric } = readDashboardState(await searchParams);

  const [pipelines, kpi, attention, board] = await Promise.all([
    listPipelines(),
    getKpiDashboard(period),
    getDashboard(),
    getBoard("outbound"),
  ]);

  // Past a dozen this stops being a queue and becomes wallpaper. The header
  // still reports the real total.
  const visible = attention.needsAttention.slice(0, 12);

  const stageNames = new Map(
    (await Promise.all(pipelines.map((pipeline) => listStages(pipeline.id))))
      .flat()
      .map((stage) => [stage.id, stage.name] as const),
  );

  return (
    <AppShell pipelines={pipelines} activeSlug="">
      <div className="scrollbar-thin h-full overflow-y-auto">
        <div className="border-hairline flex items-center justify-between gap-4 border-b px-4 py-3">
          <h1 className="text-text-1 font-mono text-micro font-semibold tracking-label uppercase">
            KPI Overview
          </h1>
          <PeriodToggle period={period} />
        </div>

        {/* Four readings as one instrument, and the chart's control. */}
        <div className="border-hairline grid grid-cols-2 border-b wide:grid-cols-4">
          {KPI_METRICS.map((candidate) => (
            <KpiTile
              key={candidate}
              reading={kpi.readings[candidate]}
              comparison={PERIOD_COMPARISON[period]}
              selected={candidate === metric}
            />
          ))}
        </div>

        <div className="grid gap-3 p-4 wide:grid-cols-[1.6fr_1fr]">
          <PerformanceChart series={kpi.series} metric={metric} />
          <StageBreakdown
            stages={kpi.stages}
            openTotal={kpi.openTotal}
            slug="outbound"
            bottleneckStageId={board?.bottleneckStageId ?? null}
          />
        </div>

        <section className="px-4 pb-4">
          <h2 className="text-text-3 mb-3 flex items-baseline gap-2 font-mono text-micro font-medium tracking-label uppercase">
            Needs attention
            <span className="text-text-2">
              {attention.needsAttention.length}
            </span>
          </h2>

          {visible.length === 0 ? (
            <p className="text-text-3 py-6 text-center font-mono text-micro">
              nothing overdue or past threshold
            </p>
          ) : (
            <ul className="divide-hairline-soft border-hairline rounded-card divide-y border">
              {visible.map((card) => (
                <li key={card.id}>
                  <Link
                    href={`/pipeline/${pipelines.find((p) => p.id === card.pipelineId)?.slug ?? "outbound"}?deal=${card.id}`}
                    className="motion-fast hover:bg-surface-2 flex items-center gap-4 px-4 py-2.5 outline-none"
                  >
                    <OwnerChip owner={card.owner} />
                    <span className="text-text-1 w-40 shrink-0 truncate font-sans text-body">
                      {contactName(card.contact)}
                    </span>
                    <span className="text-text-2 flex w-44 shrink-0 items-center gap-1.5 truncate font-sans text-tiny">
                      <SourceIcon source={card.contact.source} />
                      {card.contact.company ?? card.contact.instagramHandle}
                    </span>
                    <span className="text-text-2 w-24 shrink-0 font-mono text-data">
                      {formatDealValue(card.value, card.valueType)}
                    </span>
                    {/* Without a next action the middle column would be blank
                        and the row would read as broken data. */}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-sans text-tiny",
                        card.nextAction ? "text-text-2" : "text-text-3",
                      )}
                    >
                      {card.nextAction ?? "No next action set"}
                    </span>
                    {/* Say why the row is here. A stale deal with a next action
                        still scheduled would otherwise show a reassuring
                        "in 3d" and hide its real problem. */}
                    <span
                      className={cn(
                        "shrink-0 font-mono text-micro font-medium tracking-badge uppercase",
                        card.nextActionOverdue || card.staleness === "critical"
                          ? "text-signal-hot"
                          : "text-signal-warm",
                      )}
                    >
                      {card.nextActionOverdue && card.nextActionAt
                        ? formatDueDate(card.nextActionAt)
                        : `${card.daysInStage}d in ${stageNames.get(card.stageId) ?? "stage"}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
