import type { Owner } from "@/lib/db/enums";
import { ownerInitial } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Two operators, so a coloured initial is enough to tell them apart. */
const TONE: Record<Owner, string> = {
  riley: "bg-primary/20 text-primary",
  kavi: "bg-success/20 text-success",
};

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
        "grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-semibold",
        TONE[owner],
        className,
      )}
    >
      {ownerInitial(owner)}
    </span>
  );
}
