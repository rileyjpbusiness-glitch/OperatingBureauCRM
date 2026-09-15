"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { addLinkAction, deleteLinkAction, updateLinkAction } from "@/lib/actions";
import {
  LINK_PLATFORMS,
  LINK_PLATFORM_LABELS,
  parseUrl,
  shortenLink,
  sortLinks,
  type LeadLink,
  type LinkPlatform,
} from "@/lib/links";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Every place this lead can be found, as rows you can edit in place.
 *
 * Replaces the single HANDLE field. The URL reads as its shortened form and
 * opens in a new tab on click; clicking the small pencil-less edit affordance
 * beside it turns it into an input, saving on blur exactly like every other
 * field in this panel.
 */
export function LinksSection({
  contactId,
  links,
}: {
  contactId: string;
  links: LeadLink[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const ordered = sortLinks(links);

  async function save(linkId: string, patch: Record<string, unknown>) {
    await updateLinkAction({ linkId, ...patch });
    router.refresh();
  }

  return (
    <div className="col-span-2 grid grid-cols-[92px_1fr] items-start gap-2">
      <span className="text-text-3 pt-1 font-mono text-micro tracking-field uppercase">
        Links
      </span>

      <div className="min-w-0 space-y-1">
        {ordered.map((link) => (
          <LinkRow
            key={link.id}
            link={link}
            editing={editing === link.id}
            onEdit={() => setEditing(link.id)}
            onDone={() => setEditing(null)}
            onSave={(patch) => save(link.id, patch)}
            onDelete={async () => {
              await deleteLinkAction({ linkId: link.id });
              router.refresh();
            }}
          />
        ))}

        <button
          type="button"
          onClick={async () => {
            await addLinkAction({ contactId, platform: "instagram" });
            router.refresh();
          }}
          className="motion-fast text-text-3 hover:text-text-1 flex items-center gap-1 px-1 py-0.5 font-sans text-tiny outline-none"
        >
          <Plus className="size-3" strokeWidth={1.5} />
          Add link
        </button>
      </div>
    </div>
  );
}

function LinkRow({
  link,
  editing,
  onEdit,
  onDone,
  onSave,
  onDelete,
}: {
  link: LeadLink;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = React.useState(link.url);
  React.useEffect(() => {
    if (!editing) setDraft(link.url);
  }, [link.url, editing]);

  const url = parseUrl(link.url);
  const display = link.url ? shortenLink(link) : "";

  return (
    <div className="group flex items-center gap-1.5">
      <Select
        value={link.platform}
        onValueChange={(platform: LinkPlatform) => onSave({ platform })}
      >
        <SelectTrigger className="h-6 w-[88px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LINK_PLATFORMS.map((option) => (
            <SelectItem key={option} value={option}>
              {LINK_PLATFORM_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* A label is only meaningful on "other", where the hostname alone rarely
          says what the thing is. */}
      {link.platform === "other" ? (
        <input
          defaultValue={link.label ?? ""}
          onBlur={(event) => {
            if (event.target.value !== (link.label ?? "")) {
              void onSave({ label: event.target.value || null });
            }
          }}
          placeholder={url?.hostname ?? "Label"}
          aria-label="Link label"
          className="border-hairline text-text-2 placeholder:text-text-3 w-20 shrink-0 border-b border-dashed bg-transparent px-1 py-0.5 font-sans text-tiny outline-none"
        />
      ) : null}

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={async () => {
            onDone();
            if (draft !== link.url) await onSave({ url: draft });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(link.url);
              onDone();
            }
          }}
          aria-label="Link URL"
          className="border-hairline text-text-1 min-w-0 flex-1 border-b border-dashed bg-transparent px-1 py-0.5 font-sans text-tiny outline-none"
        />
      ) : url ? (
        // The text opens the link; the space beside it starts an edit, so one
        // row does both without a second control.
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="motion-fast text-text-1 hover:text-signal-warm truncate px-1 py-0.5 font-sans text-tiny underline decoration-dotted underline-offset-2 outline-none"
          >
            {display}
          </a>
          <button
            type="button"
            onClick={onEdit}
            title="Edit URL"
            aria-label="Edit URL"
            className="motion-fast text-text-3 hover:text-text-1 shrink-0 font-mono text-micro opacity-0 outline-none group-hover:opacity-100"
          >
            edit
          </button>
        </span>
      ) : (
        // Not a URL, or empty. Shown as plain text rather than a broken anchor.
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            "motion-fast hover:bg-surface-3 rounded-control text-text-1 min-w-0 flex-1 truncate px-1 py-0.5 text-left font-sans text-tiny outline-none",
            !link.url && "border-hairline min-h-[1.25rem] border-b border-dashed",
          )}
        >
          {link.url}
        </button>
      )}

      <button
        type="button"
        onClick={() => void onDelete()}
        title="Delete link"
        aria-label="Delete link"
        className="motion-fast hover:text-signal-hot text-text-3 shrink-0 outline-none"
      >
        <Trash2 className="size-3" strokeWidth={1} />
      </button>
    </div>
  );
}
