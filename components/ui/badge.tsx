import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-control font-mono text-micro font-medium tracking-badge uppercase whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-surface-3 text-text-2",
        outline: "border border-hairline text-text-3",
        // The three signals, and nothing else.
        warm: "bg-signal-warm/15 text-signal-warm",
        hot: "bg-signal-hot/15 text-signal-hot",
        good: "bg-signal-good/15 text-signal-good",
      },
      size: {
        default: "h-5 px-1.5",
        sm: "h-4 px-1",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
