"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { emptyBinAction, restoreDealAction } from "@/lib/actions";
import { formatDate } from "@/lib/dates";
import { contactName, formatDealValue } from "@/lib/format";
import type { DealCard } from "@/lib/repo/types";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * What is in the bin: one row per lead, newest first, each with the day it was
 * binned. Nothing here is gone yet -- a row can be put back, and only Empty
 * destroys anything.
 */
export function BinSheet({
  open,
  binned,
}: {
  open: boolean;
  binned: DealCard[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [confirming, setConfirming] = React.useState(false);
  const [working, setWorking] = React.useState(false);

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete("bin");
    const qs = next.toString();
    router.push(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }

  // Reaching for Empty and then closing the sheet should not leave the second
  // click armed for next time.
  React.useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  async function restore(dealId: string) {
    setWorking(true);
    try {
      await restoreDealAction({ dealId });
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  async function empty() {
    setWorking(true);
    try {
      await emptyBinAction();
      setConfirming(false);
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent aria-describedby={undefined}>
        <div className="border-hairline flex shrink-0 items-baseline gap-2 border-b px-4 py-3.5 pr-10">
          <SheetTitle asChild>
            <h2 className="text-text-1 font-serif text-wordmark">Bin</h2>
          </SheetTitle>
          <span className="text-text-3 font-mono text-micro">
            {binned.length === 0
              ? "empty"
              : `${binned.length} lead${binned.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <SheetDescription className="sr-only">
          Leads removed from the board, with the day each was binned
        </SheetDescription>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
          {binned.length === 0 ? (
            <p className="text-text-3 py-10 text-center font-mono text-micro">
              nothing in the bin
            </p>
          ) : (
            <ul className="space-y-2">
              {binned.map((card) => (
                <li
                  key={card.id}
                  className="border-hairline bg-surface-2 rounded-card group flex items-center gap-3 border px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-text-1 truncate font-sans text-body font-medium">
                      {contactName(card.contact)}
                    </p>
                    <p className="text-text-3 mt-0.5 truncate font-sans text-tiny">
                      {card.contact.company ??
                        card.contact.instagramHandle ??
                        "No company"}
                    </p>
                  </div>

                  {card.value > 0 ? (
                    <span className="text-text-2 shrink-0 font-mono text-data">
                      {formatDealValue(card.value, card.valueType)}
                    </span>
                  ) : null}

                  {/* The day it left the board, which is the only thing you
                      cannot work out from the card itself. */}
                  <span
                    className="text-text-3 w-16 shrink-0 text-right font-mono text-micro tracking-badge uppercase"
                    title={
                      card.binnedAt
                        ? `Binned ${formatDate(card.binnedAt)}`
                        : undefined
                    }
                  >
                    {card.binnedAt ? formatDate(card.binnedAt) : "--"}
                  </span>

                  <button
                    type="button"
                    disabled={working}
                    onClick={() => restore(card.id)}
                    title="Put back on the board"
                    aria-label={`Put ${contactName(card.contact)} back on the board`}
                    className="motion-fast rounded-control text-text-3 hover:text-text-1 flex size-6 shrink-0 items-center justify-center outline-none disabled:opacity-40"
                  >
                    <RotateCcw
                      strokeWidth={1.25}
                      className="size-[var(--icon-size)]"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-hairline flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-text-3 font-mono text-micro">
            {confirming
              ? "This cannot be undone."
              : "Leads stay here until you empty it."}
          </p>
          {/* Two clicks, because the first one is the only warning there is. */}
          <Button
            variant={confirming ? "destructive" : "secondary"}
            disabled={binned.length === 0 || working}
            onClick={() => (confirming ? empty() : setConfirming(true))}
          >
            {confirming ? "Delete for good" : "Empty"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
