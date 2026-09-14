"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pin, Trash2 } from "lucide-react";

import { createNoteAction, deleteNoteAction, updateNoteAction } from "@/lib/actions";
import type { Owner } from "@/lib/db/enums";
import type { Note } from "@/lib/repo/types";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

const OWNER_LABELS: Record<Owner, string> = { riley: "Riley", kavi: "Kavi" };

export function NotesTab({
  dealId,
  notes,
  author,
}: {
  dealId: string;
  notes: Note[];
  author: Owner;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  /** Autosaves on blur: leaving the box is the commit. */
  async function commit() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      await createNoteAction({ dealId, body, author });
      setDraft("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          rows={4}
          placeholder="Write a note. Markdown works. Saves when you click away."
        />
        {saving ? (
          <p className="text-muted-foreground mt-1 text-[10px]">Saving...</p>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <p className="text-muted-foreground/60 text-[11px]">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className={cn(
                "bg-card rounded-md border px-2.5 py-2",
                note.pinned && "border-warning/40",
              )}
            >
              <div className="text-muted-foreground mb-1 flex items-center gap-2 text-[10px]">
                <span className="font-medium">{OWNER_LABELS[note.author]}</span>
                <span>{formatDateTime(note.createdAt)}</span>
                <button
                  type="button"
                  title={note.pinned ? "Unpin" : "Pin to top"}
                  className={cn(
                    "hover:text-foreground ml-auto",
                    note.pinned && "text-warning",
                  )}
                  onClick={async () => {
                    await updateNoteAction({
                      noteId: note.id,
                      pinned: !note.pinned,
                    });
                    router.refresh();
                  }}
                >
                  <Pin className="size-3" />
                </button>
                <button
                  type="button"
                  title="Delete note"
                  className="hover:text-destructive"
                  onClick={async () => {
                    await deleteNoteAction({ noteId: note.id });
                    router.refresh();
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <div className="prose-note text-[11px] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {note.body}
                </ReactMarkdown>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
