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
import { ThemeToggle } from "./theme-toggle";

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
      <header className="border-hairline flex h-[var(--topbar-height)] shrink-0 items-center gap-4 border-b px-4">
        {/* Serif wordmark against a mono switcher: the whole tone in one line. */}
        <Link
          href="/"
          className="text-text-1 shrink-0 font-serif text-wordmark outline-none"
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
                "motion-fast rounded-control px-2 py-1 font-mono text-micro tracking-label uppercase outline-none",
                pipeline.slug === activeSlug
                  ? "bg-surface-3 text-text-1"
                  : "text-text-3 hover:text-text-1",
              )}
            >
              {pipeline.name}
            </Link>
          ))}
        </nav>

        <div className="relative ml-2 w-56">
          <Search
            strokeWidth={1}
            className="text-text-3 pointer-events-none absolute top-1/2 left-2 size-[var(--icon-size)] -translate-y-1/2"
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search    /"
            className="pl-7"
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
                  "motion-fast rounded-control size-6 font-mono text-micro font-medium outline-none",
                  active
                    ? "bg-surface-3 text-text-1"
                    : "text-text-3 hover:text-text-1",
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
            "motion-fast rounded-control shrink-0 px-2 py-1 font-mono text-micro tracking-label uppercase outline-none",
            statsOn ? "bg-surface-3 text-text-1" : "text-text-3 hover:text-text-1",
          )}
        >
          Stats
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />

          {newLeadTarget ? (
            <Button onClick={() => setAdding(true)} title="New lead (n)">
              <Plus strokeWidth={1.5} />
              Lead
            </Button>
          ) : null}
        </div>
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
