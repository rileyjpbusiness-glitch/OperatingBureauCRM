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
  type = "text",
  className,
  multiline = false,
  display,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
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
    // An empty field renders as an empty slot rather than the words "Not set".
    // Blank already says blank, eight times over on a fresh lead.
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "motion-fast hover:bg-surface-3 rounded-control text-text-1 block w-full truncate px-1 py-0.5 text-left font-sans text-tiny outline-none",
          // An empty field gets a faint dashed rule: enough to read as
          // fillable rather than broken, without a word of placeholder text.
          !value && "border-hairline min-h-[1.25rem] border-b border-dashed",
          className,
        )}
      >
        {display ?? value}
      </button>
    );
  }

  const shared = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    className: cn(
      "border-hairline bg-surface-2 text-text-1 rounded-control w-full border px-1 py-0.5 font-sans text-tiny outline-none",
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
