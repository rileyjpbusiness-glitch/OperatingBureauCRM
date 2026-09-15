"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { suggestLeadsAction } from "@/lib/actions";
import type { LeadSuggestion } from "@/lib/repo/search";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Matches the repository's floor, so the two cannot drift apart. */
const MIN_LENGTH = 3;

/**
 * The search box does two things at once, and they are not the same thing.
 *
 * Typing filters the board, as it always has. Typing three letters also offers
 * the leads it matches, and picking one jumps straight to that card with its
 * panel open -- which is the faster path when you already know who you are
 * looking for and do not want the board narrowed around them.
 */
export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState(params.get("q") ?? "");
  const [suggestions, setSuggestions] = React.useState<LeadSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

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

  // The board filter is debounced so every keystroke is not a round trip to
  // SQLite.
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => setParam("q", query || null), 250);
    return () => clearTimeout(timer);
  }, [query, params, setParam]);

  // Suggestions are debounced separately and more tightly: this is what you are
  // watching while you type, so it has to feel immediate.
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < MIN_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await suggestLeadsAction({ term });
        // A slow answer to an earlier keystroke must not overwrite a newer one.
        if (cancelled) return;
        setSuggestions(results);
        setActive(0);
        setOpen(results.length > 0);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // "/" focuses the box from anywhere that is not already a text field.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(suggestion: LeadSuggestion) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    // Straight to the card, panel open, and without the board filtered down to
    // the one lead you just left.
    router.push(
      `/pipeline/${suggestion.pipelineSlug}?deal=${suggestion.dealId}`,
      { scroll: false },
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter") {
      const choice = suggestions[active];
      if (choice) {
        event.preventDefault();
        go(choice);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative ml-2 w-56">
      <Search
        strokeWidth={1}
        className="text-text-3 pointer-events-none absolute top-1/2 left-2 size-[var(--icon-size)] -translate-y-1/2"
      />
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(suggestions.length > 0)}
        // A click on a row would otherwise be swallowed by the blur that
        // closes the list first.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Search    /"
        className="pl-7"
        aria-label="Search leads"
        aria-autocomplete="list"
        aria-expanded={open}
        role="combobox"
        aria-controls="lead-suggestions"
      />

      {open && suggestions.length > 0 ? (
        <ul
          id="lead-suggestions"
          role="listbox"
          className="border-hairline bg-surface-2 rounded-card absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden border py-1 shadow-[var(--shadow-drag)]"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.dealId}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(suggestion)}
                className={cn(
                  "motion-fast flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left outline-none",
                  index === active ? "bg-surface-3" : "bg-transparent",
                )}
              >
                <span className="text-text-1 min-w-0 flex-1 truncate font-sans text-tiny">
                  {suggestion.name}
                </span>
                {suggestion.org ? (
                  <span className="text-text-3 min-w-0 max-w-24 truncate font-sans text-micro">
                    {suggestion.org}
                  </span>
                ) : null}
                <span className="text-text-3 shrink-0 font-mono text-micro tracking-badge uppercase">
                  {suggestion.stageName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
