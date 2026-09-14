import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "motion-fast border-hairline bg-surface-2 text-text-1 placeholder:text-text-3 rounded-control h-7 w-full border px-2 font-sans text-tiny outline-none hover:border-text-3 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
