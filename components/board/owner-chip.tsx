import type { Owner } from "@/lib/db/enums";
import { ownerInitial } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Neutral by design. Two operators do not need two colours, and colour in this
 * interface is reserved for things that carry meaning about the work.
 */
export function OwnerChip({
  owner,
  className,
}: {
  owner: Owner;
  className?: string;
}) {
  return (
    <span
      title={owner === "riley" ? "Riley" : "Kavi"}
      className={cn(
        "bg-surface-3 text-text-2 grid size-4 shrink-0 place-items-center rounded-full font-mono text-micro font-medium",
        className,
      )}
    >
      {ownerInitial(owner)}
    </span>
  );
}
