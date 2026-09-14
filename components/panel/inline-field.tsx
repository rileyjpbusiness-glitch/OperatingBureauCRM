"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A value that becomes an input when you click it and saves when you leave it.
 * The detail panel has no Details tab any more, so everything about a deal is
 * edited in place.
 */
export function InlineField({
  value,
  onSave,
  placeholder = "Not set",
  type = "text",
  className,
  multiline = false,
  display,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  placeholder?: string;
  type?: "text" | "email" | "number" | "date";
  className?: string;
  multiline?: boolean;
  /** What to show when not editing, if the raw value is not what you'd read. */
  display?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function commit() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "hover:bg-accent/60 w-full truncate rounded px-1 py-0.5 text-left text-[11px] transition-colors",
          !value && "text-muted-foreground/50",
          className,
        )}
      >
        {display ?? value ?? ""} {!value && !display ? placeholder : ""}
      </button>
    );
  }

  const shared = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    className: cn(
      "border-input bg-card focus-visible:ring-ring w-full rounded border px-1 py-0.5 text-[11px] outline-none focus-visible:ring-2",
      className,
    ),
  };

  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={3}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <input
      {...shared}
      type={type}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
