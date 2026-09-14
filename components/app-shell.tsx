import Link from "next/link";

import type { Pipeline } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

export function AppShell({
  pipelines,
  activeSlug,
  children,
}: {
  pipelines: Pipeline[];
  activeSlug: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center gap-4 border-b px-3">
        <span className="text-xs font-semibold tracking-tight">Bureau</span>

        <nav className="flex items-center gap-0.5">
          {pipelines.map((pipeline) => (
            <Link
              key={pipeline.id}
              href={`/pipeline/${pipeline.slug}`}
              className={cn(
                "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                pipeline.slug === activeSlug
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {pipeline.name}
            </Link>
          ))}
        </nav>
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
