import type { DealCard as DealCardModel, StageWithMetrics } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

import { DealCard } from "./deal-card";
import { StageHeader } from "./stage-header";

export function StageColumn({
  stage,
  cards,
  previousStageName,
  isBottleneck,
}: {
  stage: StageWithMetrics;
  cards: DealCardModel[];
  previousStageName: string | null;
  isBottleneck: boolean;
}) {
  return (
    <section
      aria-label={stage.name}
      className={cn(
        "bg-card/20 flex h-full w-[264px] shrink-0 flex-col rounded-md border",
        isBottleneck && "border-warning/40",
      )}
    >
      <StageHeader
        stage={stage}
        previousStageName={previousStageName}
        isBottleneck={isBottleneck}
      />

      {/* Each column scrolls on its own; the page never does. */}
      <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {cards.length === 0 ? (
          <p className="text-muted-foreground/50 px-1 py-3 text-center text-[11px]">
            Empty
          </p>
        ) : (
          cards.map((card) => <DealCard key={card.id} card={card} />)
        )}
      </div>
    </section>
  );
}
