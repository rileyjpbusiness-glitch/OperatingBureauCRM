import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "motion-base inline-flex items-center justify-center gap-1.5 rounded-control whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Warm white, not a coloured button: maximum contrast, zero hue.
        default:
          "bg-text-1 text-ground font-sans text-tiny font-medium hover:bg-text-1/90",
        secondary:
          "bg-surface-3 text-text-1 font-sans text-tiny hover:bg-surface-3/70",
        outline:
          "border border-hairline text-text-2 font-sans text-tiny hover:bg-surface-3 hover:text-text-1",
        ghost: "text-text-2 font-sans text-tiny hover:bg-surface-3 hover:text-text-1",
      },
      size: {
        default: "h-7 px-2.5 [&_svg]:size-3.5",
        sm: "h-6 px-2 text-micro [&_svg]:size-3",
        icon: "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
