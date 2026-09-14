import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "motion-fast border-hairline bg-surface-2 text-text-1 placeholder:text-text-3 rounded-control w-full resize-y border px-2 py-1.5 font-sans text-tiny leading-relaxed outline-none hover:border-text-3",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
