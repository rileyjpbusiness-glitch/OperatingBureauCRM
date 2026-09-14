import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-card placeholder:text-muted-foreground/70 focus-visible:ring-ring w-full resize-y rounded-md border px-2 py-1.5 text-xs leading-relaxed outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
