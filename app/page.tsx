import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SourceIcon } from "@/components/board/source-icon";
import { OwnerChip } from "@/components/board/owner-chip";
import {
  contactName,
  formatCents,
  formatDealValue,
  formatDueDate,
  formatPercent,
} from "@/lib/format";
import { getDashboard, listPipelines, listStages } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bureau" };

/**
 * One cell of the instrument strip. The cells are divided by hairlines rather
 * than boxed individually, so five readings read as one instrument.
 */
function Cell({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={cn(
        "border-hairline px-4 py-4",
        // Two across when narrow, five when there is room. The first cell of
        // each row loses its divider; rows after the first gain a rule above.
        "border-l [&:nth-child(odd)]:border-l-0 [&:nth-child(n+3)]:border-t",
        "wide:border-l wide:[&:nth-child(odd)]:border-l wide:first:border-l-0 wide:[&:nth-child(n+3)]:border-t-0",
      )}
    >
      <p className="text-text-3 font-mono text-micro font-medium tracking-label uppercase">
        {label}
      </p>
      {/* The only serif in the application outside the wordmark. */}
      <p className="text-text-1 mt-2 font-serif text-figure leading-none">
        {value}
      </p>
    </div>
  );
}

export default async function DashboardPage() {
  const [pipelines, dashboard] = await Promise.all([
    listPipelines(),
    getDashboard(),
  ]);

  // Past a dozen this stops being a queue and becomes wallpaper. The header
  // still reports the real total.
  const visible = dashboard.needsAttention.slice(0, 12);

  const stageNames = new Map(
    (await Promise.all(pipelines.map((pipeline) => listStages(pipeline.id))))
      .flat()
      .map((stage) => [stage.id, stage.name] as const),
  );

  return (
    <AppShell pipelines={pipelines} activeSlug="">
      <div className="scrollbar-thin h-full overflow-y-auto">
        <div className="border-hairline border-y">
          <div className="grid grid-cols-2 wide:grid-cols-5">
            <Cell
              label="Touches logged this week"
              value={String(dashboard.touchesThisWeek)}
            />
            <Cell label="Follow-ups due" value={String(dashboard.followUpsDue)} />
            <Cell
              label="Calls booked this week"
              value={String(dashboard.callsBookedThisWeek)}
            />
            <Cell
              label="Close rate (30d)"
              value={
                dashboard.closeRate.rate === null
                  ? "—"
                  : formatPercent(dashboard.closeRate.rate)
              }
              title={`${dashboard.closeRate.won} of ${dashboard.closeRate.reached} deals that reached the closing stage in the last 30 days were won`}
            />
            <Cell
              label="Open pipeline MRR"
              value={formatCents(dashboard.openPipelineMrrCents)}
            />
          </div>
        </div>

        <section className="p-4">
          <h2 className="text-text-3 mb-3 flex items-baseline gap-2 font-mono text-micro font-medium tracking-label uppercase">
            Needs attention
            <span className="text-text-2">{dashboard.needsAttention.length}</span>
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
