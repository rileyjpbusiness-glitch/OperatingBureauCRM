import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SourceIcon } from "@/components/board/source-icon";
import { OwnerChip } from "@/components/board/owner-chip";
import {
  contactName,
  formatCents,
  formatDealValue,
  formatDueDate,
} from "@/lib/format";
import { getDashboard, listPipelines, listStages } from "@/lib/repo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Bureau" };

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card/40 rounded-md border px-3 py-2.5">
      <p className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg leading-none tabular-nums">{value}</p>
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
    (
      await Promise.all(pipelines.map((pipeline) => listStages(pipeline.id)))
    )
      .flat()
      .map((stage) => [stage.id, stage.name] as const),
  );

  return (
    <AppShell pipelines={pipelines} activeSlug="">
      <div className="scrollbar-thin h-full overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {/* Touches, not new rows: adding a lead to a database is not
              work, messaging someone is, and it drives every other number. */}
          <Tile
            label="Touches logged this week"
            value={String(dashboard.touchesThisWeek)}
          />
          <Tile label="Follow-ups due" value={String(dashboard.followUpsDue)} />
          <Tile
            label="Calls booked this week"
            value={String(dashboard.callsBookedThisWeek)}
          />
          <Tile
            label="Open pipeline MRR"
            value={formatCents(dashboard.openPipelineMrrCents)}
          />
        </div>

        <section className="mt-4">
          <h2 className="text-muted-foreground mb-2 text-[10px] tracking-wide uppercase">
            Needs attention
            <span className="ml-2 font-mono">
              {dashboard.needsAttention.length}
            </span>
          </h2>

          {visible.length === 0 ? (
            <p className="text-muted-foreground/60 text-[11px]">
              Nothing is overdue or past its stage threshold.
            </p>
          ) : (
            <ul className="divide-border divide-y rounded-md border">
              {visible.map((card) => (
                <li key={card.id}>
                  <Link
                    href={`/pipeline/${pipelines.find((p) => p.id === card.pipelineId)?.slug ?? "outbound"}?deal=${card.id}`}
                    className="hover:bg-accent/40 flex items-center gap-3 px-3 py-2 transition-colors"
                  >
                    <OwnerChip owner={card.owner} />
                    <span className="w-40 shrink-0 truncate text-xs font-medium">
                      {contactName(card.contact)}
                    </span>
                    <span className="text-muted-foreground flex w-44 shrink-0 items-center gap-1 truncate text-[11px]">
                      <SourceIcon source={card.contact.source} />
                      {card.contact.company ?? card.contact.instagramHandle}
                    </span>
                    <span className="text-muted-foreground w-24 shrink-0 font-mono text-[11px] tabular-nums">
                      {formatDealValue(card.value, card.valueType)}
                    </span>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
                      {card.nextAction ?? ""}
                    </span>
                    {/* Say why the row is here. A stale deal with a next
                        action still scheduled would otherwise show a
                        reassuring "in 3d" and hide its real problem. */}
                    <span
                      className={cn(
                        "shrink-0 text-[10px]",
                        card.nextActionOverdue || card.staleness === "critical"
                          ? "text-destructive"
                          : "text-warning",
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
