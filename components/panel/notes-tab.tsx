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
          <p className="text-text-3 mt-1 font-mono text-micro">saving</p>
        ) : null}
      </div>

      {notes.length === 0 ? (
        <p className="text-text-3 py-4 text-center font-mono text-micro">no notes yet</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className={cn(
                "border-hairline bg-surface-2 rounded-card border px-3.5 py-3",
                note.pinned && "border-signal-warm/40",
              )}
            >
              <div className="text-text-3 mb-2 flex items-center gap-2 font-mono text-micro">
                <span className="text-text-2 font-medium">{OWNER_LABELS[note.author]}</span>
                <span>{formatDateTime(note.createdAt)}</span>
                <button
                  type="button"
                  title={note.pinned ? "Unpin" : "Pin to top"}
                  className={cn(
                    "motion-fast hover:text-text-1 ml-auto outline-none",
                    note.pinned && "text-signal-warm",
                  )}
                  onClick={async () => {
                    await updateNoteAction({
                      noteId: note.id,
                      pinned: !note.pinned,
                    });
                    router.refresh();
                  }}
                >
                  <Pin className="size-3" strokeWidth={1} />
                </button>
                <button
                  type="button"
                  title="Delete note"
                  className="motion-fast hover:text-signal-hot outline-none"
                  onClick={async () => {
                    await deleteNoteAction({ noteId: note.id });
                    router.refresh();
                  }}
                >
                  <Trash2 className="size-3" strokeWidth={1} />
                </button>
              </div>
              <div className="text-text-1 font-sans text-tiny leading-relaxed [&_strong]:font-medium">
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
