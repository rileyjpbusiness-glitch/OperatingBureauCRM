import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        outline: "border text-muted-foreground",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        destructive: "bg-destructive/15 text-destructive",
      },
      size: {
        default: "h-5 px-1.5 text-[11px]",
        sm: "h-4 px-1 text-[10px]",
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
