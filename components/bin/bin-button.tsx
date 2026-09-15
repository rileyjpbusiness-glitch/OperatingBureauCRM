"use client";

import { Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * The bin, in the top bar. Cards are dragged onto it and it opens on click.
 *
 * It is only a button. The drop target is a separate element the board portals
 * into the slot around it, because a droppable has to sit inside the board's
 * drag context and this sits in the header, above it.
 */
export function BinButton({ count }: { count: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function open() {
    const next = new URLSearchParams(params.toString());
    next.set("bin", "1");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={open}
      title={count === 0 ? "Bin (empty)" : `Bin (${count})`}
      aria-label={count === 0 ? "Bin, empty" : `Bin, ${count} leads`}
      className={cn(
        "motion-fast rounded-control relative flex size-6 shrink-0 items-center justify-center outline-none",
        count > 0 ? "text-text-2 hover:text-text-1" : "text-text-3 hover:text-text-1",
      )}
    >
      <Trash2 strokeWidth={1} className="size-[var(--icon-size)]" />
      {/* A full bin says so without a number: the count is in the tooltip, and
          a badge on a 24px control would be louder than what it reports. */}
      {count > 0 ? (
        <span
          aria-hidden
          className="bg-text-2 absolute top-0.5 right-0.5 size-1 rounded-full"
        />
      ) : null}
    </button>
  );
}
