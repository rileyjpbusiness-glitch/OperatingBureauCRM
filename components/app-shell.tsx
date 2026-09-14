"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { OWNERS, type Owner } from "@/lib/db/enums";
import type { Pipeline } from "@/lib/repo/types";
import { ownerInitial } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { NewLeadDialog } from "./new-lead-dialog";

/**
 * Everything the board is driven by lives in the query string, so a filtered
 * view survives a refresh and can be pasted to someone else.
 */
export function AppShell({
  pipelines,
  activeSlug,
  newLeadTarget,
  children,
}: {
  pipelines: Pipeline[];
  activeSlug: string;
  /** Where the + Lead button drops a new deal. Absent on the dashboard. */
  newLeadTarget?: { pipelineId: string; stageId: string };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState(params.get("q") ?? "");

  const owner = params.get("owner");
  const statsOn = params.get("stats") === "1";

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // The search box writes to the URL on a short delay so every keystroke is not
  // a round trip to SQLite.
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => setParam("q", query || null), 250);
    return () => clearTimeout(timer);
  }, [query, params, setParam]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "n" && !typing && !event.metaKey && !event.ctrlKey) {
        if (!newLeadTarget) return;
        event.preventDefault();
        setAdding(true);
        return;
      }
      if (event.key === "Escape") {
        // Radix already closes its own overlays; this handles the search box
        // and the URL-driven detail panel.
        if (typing) {
          (target as HTMLElement).blur();
          return;
        }
        if (params.get("deal")) setParam("deal", null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newLeadTarget, params, setParam]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
        <Link
          href="/"
          className="shrink-0 text-xs font-semibold tracking-tight"
          title="Dashboard"
        >
          Bureau
        </Link>

        <nav className="flex shrink-0 items-center gap-0.5">
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

        <div className="relative ml-2 w-56">
          <Search className="text-muted-foreground/60 pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search    /"
            className="pl-6"
            aria-label="Search leads"
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {OWNERS.map((candidate) => {
            const active = owner === candidate;
            return (
              <button
                key={candidate}
                type="button"
                title={candidate === "riley" ? "Riley" : "Kavi"}
                onClick={() => setParam("owner", active ? null : candidate)}
                className={cn(
                  "size-6 rounded text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {ownerInitial(candidate as Owner)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setParam("stats", statsOn ? null : "1")}
          className={cn(
            "shrink-0 rounded px-2 py-1 text-[11px] font-medium transition-colors",
            statsOn
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          Stats
        </button>

        {newLeadTarget ? (
          <Button
            className="ml-auto shrink-0"
            onClick={() => setAdding(true)}
            title="New lead (n)"
          >
            <Plus />
            Lead
          </Button>
        ) : null}
      </header>

      <main className="min-h-0 flex-1">{children}</main>

      {newLeadTarget ? (
        <NewLeadDialog
          open={adding}
          onOpenChange={setAdding}
          pipelineId={newLeadTarget.pipelineId}
          stageId={newLeadTarget.stageId}
        />
      ) : null}
    </div>
  );
}
