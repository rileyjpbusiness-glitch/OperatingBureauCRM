"use client";

import { Moon, Sun } from "lucide-react";

/** Shared with the inline script in the root layout that sets the attribute. */
export const THEME_STORAGE_KEY = "bureau.theme";

/**
 * Dark or light, remembered per browser. The attribute is already on <html>
 * before React runs, put there by the layout's inline script, so this button
 * only has to flip it and CSS decides which icon is showing. Nothing to read on
 * mount means nothing to mismatch between the server's markup and the client's.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A blocked store just means the choice does not outlive the tab.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Switch between light and dark"
      aria-label="Switch between light and dark"
      className="motion-fast rounded-control text-text-3 hover:text-text-1 flex size-6 shrink-0 items-center justify-center outline-none"
    >
      <Sun strokeWidth={1} className="when-dark size-[var(--icon-size)]" />
      <Moon strokeWidth={1} className="when-light size-[var(--icon-size)]" />
    </button>
  );
}
