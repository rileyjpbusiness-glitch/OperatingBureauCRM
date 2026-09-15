"use client";

import * as React from "react";
import { Trash2, Upload } from "lucide-react";

import { importContextAction } from "@/lib/actions";
import { OWNERS, SOURCES, type Owner, type Source } from "@/lib/db/enums";
import {
  LINK_PLATFORMS,
  LINK_PLATFORM_LABELS,
  normalizeInstagramUrl,
  shortenLink,
  type LinkPlatform,
} from "@/lib/links";
import { parseLeads, type ParsedLead, type ParsedLink } from "@/lib/import/parse-leads";
import { cn } from "@/lib/utils";
import { SOURCE_LABELS } from "@/components/board/source-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OWNER_LABELS: Record<Owner, string> = { riley: "Riley", kavi: "Kavi" };

/** One import at a time stays reviewable; past this the preview is wallpaper. */
const IMPORT_CAP = 100;

const ACCEPTED = [".md", ".markdown", ".txt"];
const REJECT_MESSAGE =
  "Export your Google Doc as .md or .txt, or paste the text instead.";

type Row = {
  key: string;
  name: string;
  company: string;
  niche: string;
  links: ParsedLink[];
  confidence: ParsedLead["confidence"];
  include: boolean;
  duplicate: boolean;
  expanded: boolean;
};

type Context = Awaited<ReturnType<typeof importContextAction>>;

/** The editable text columns. Tab walks down one of these, never across. */
type Column = "name" | "company" | "niche";

/**
 * Rebuilds the source text for leads that did not fit under the cap, so the
 * second run parses them the same way the first would have. The niche is
 * re-emitted whenever it changes, because it lives above the blocks rather than
 * inside them.
 */
function remainderText(leads: ParsedLead[]): string {
  const out: string[] = [];
  let niche = "";
  for (const lead of leads) {
    if (lead.niche && lead.niche !== niche) {
      niche = lead.niche;
      out.push("", niche, "");
    }
    out.push(`- ${lead.links.map((link) => link.url).join(" ")}`);
  }
  return out.join("\n").trim();
}

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [context, setContext] = React.useState<Context | null>(null);
  const [text, setText] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const [stageId, setStageId] = React.useState("");
  const [owner, setOwner] = React.useState<Owner>("riley");
  const [source, setSource] = React.useState<Source>("ig_dm");
  const [nicheOverride, setNicheOverride] = React.useState("");

  // Column-wise refs: Tab walks down a column rather than across a row.
  const cells = React.useRef(new Map<string, HTMLInputElement>());

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void importContextAction().then((loaded) => {
      if (cancelled) return;
      setContext(loaded);
      // Default to New Lead without hardcoding it: the first stage of the
      // first pipeline is the same source of truth the board orders by.
      const first = loaded.pipelines[0]?.stages[0];
      setStageId((current) => current || (first?.id ?? ""));
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Closing throws the whole attempt away rather than leaving half a parse to
  // come back to and misread later.
  React.useEffect(() => {
    if (open) return;
    setRows(null);
    setNotice(null);
    setFileError(null);
    setText("");
    setNicheOverride("");
  }, [open]);

  function parse() {
    setFileError(null);
    const all = parseLeads(text);
    const known = new Set(context?.existingInstagram ?? []);

    const taken = all.slice(0, IMPORT_CAP);
    const left = all.slice(IMPORT_CAP);

    setRows(
      taken.map((lead, index) => {
        const instagram = lead.links.find((link) => link.platform === "instagram");
        const key = normalizeInstagramUrl(instagram?.url ?? "");
        const duplicate = key !== null && known.has(key);
        return {
          key: `${index}`,
          name: lead.name,
          company: lead.company,
          niche: nicheOverride.trim() || lead.niche,
          links: lead.links,
          confidence: lead.confidence,
          // A lead already on the board starts unchecked, not hidden: you can
          // still tick it if you meant to bring it in again.
          include: !duplicate,
          duplicate,
          expanded: false,
        };
      }),
    );

    if (left.length > 0) {
      setText(remainderText(left));
      setNotice(
        `${IMPORT_CAP} lead cap per import. ${left.length} leads left in the box, run the import again.`,
      );
    } else {
      setNotice(null);
    }
  }

  async function readFile(file: File) {
    const name = file.name.toLowerCase();
    if (!ACCEPTED.some((extension) => name.endsWith(extension))) {
      setFileError(REJECT_MESSAGE);
      return;
    }
    setFileError(null);
    setText(await file.text());
  }

  function patch(index: number, changes: Partial<Row>) {
    setRows((current) =>
      current
        ? current.map((row, i) => (i === index ? { ...row, ...changes } : row))
        : current,
    );
  }

  /** Tab moves down the column. Shift+Tab moves up it. */
  function onCellKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    column: Column,
    index: number,
  ) {
    if (event.key !== "Tab") return;
    const next = event.shiftKey ? index - 1 : index + 1;
    const target = cells.current.get(`${column}:${next}`);
    if (!target) return;
    event.preventDefault();
    target.focus();
    target.select();
  }

  const selected = rows?.filter((row) => row.include).length ?? 0;
  const stages = context?.pipelines.flatMap((pipeline) =>
    pipeline.stages.map((stage) => ({ ...stage, pipeline: pipeline.name })),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[var(--import-dialog-width)]"
        aria-describedby={undefined}
      >
        <DialogTitle asChild>
          <h2 className="text-text-1 font-serif text-wordmark">Import leads</h2>
        </DialogTitle>
        <DialogDescription className="sr-only">
          Paste or drop a prospecting doc, review what it found, then import
        </DialogDescription>

        <div className="mt-3 space-y-3">
          {/* Region A: where the text comes from */}
          <div>
            <label className="text-text-3 mb-1 block font-mono text-micro tracking-field uppercase">
              Source
            </label>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your prospecting doc here, or drop a .md / .txt export."
              spellCheck={false}
              className="border-hairline bg-surface-1 rounded-control text-text-1 placeholder:text-text-3 scrollbar-thin h-28 w-full resize-none border p-2 font-mono text-micro outline-none"
            />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void readFile(file);
              }}
              className={cn(
                "motion-fast rounded-control mt-1 flex items-center justify-center gap-2 border border-dashed py-2 font-sans text-tiny",
                dragging
                  ? "border-text-3 bg-surface-2 text-text-1"
                  : "border-hairline text-text-3",
              )}
            >
              <Upload className="size-3" strokeWidth={1.25} />
              Drop a .md, .markdown or .txt file
              <label className="text-text-2 hover:text-text-1 motion-fast cursor-pointer underline decoration-dotted underline-offset-2">
                or choose one
                <input
                  type="file"
                  accept={ACCEPTED.join(",")}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                />
              </label>
            </div>
            {fileError ? (
              <p className="text-signal-warm mt-1 font-mono text-micro">
                {fileError}
              </p>
            ) : null}
          </div>

          {/* Region B: where they land */}
          <div className="grid grid-cols-4 gap-2">
            <Field label="Stage">
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-6 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(stages ?? []).map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner">
              <Select value={owner} onValueChange={(value: Owner) => setOwner(value)}>
                <SelectTrigger className="h-6 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OWNERS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {OWNER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={source} onValueChange={(value: Source) => setSource(value)}>
                <SelectTrigger className="h-6 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {SOURCE_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Niche override">
              <Input
                value={nicheOverride}
                onChange={(event) => setNicheOverride(event.target.value)}
                placeholder="optional"
                className="h-6"
              />
            </Field>
          </div>

          {/* Region C: what it found */}
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={parse} disabled={!text.trim()}>
              Parse
            </Button>
            {rows ? (
              <span className="text-text-3 font-mono text-micro">
                {rows.length} found
                {rows.some((row) => row.duplicate)
                  ? ` · ${rows.filter((row) => row.duplicate).length} already on the board`
                  : ""}
              </span>
            ) : null}
          </div>

          {notice ? (
            <p className="text-signal-warm font-mono text-micro">{notice}</p>
          ) : null}

          {rows ? (
            <PreviewTable
              rows={rows}
              cells={cells}
              onPatch={patch}
              onCellKeyDown={onCellKeyDown}
            />
          ) : null}
        </div>

        <div className="border-hairline mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-text-3 font-mono text-micro">
            {rows ? `${selected} of ${rows.length} leads selected` : "Nothing parsed yet"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={selected === 0} title="Not wired up yet">
              Import {selected} {selected === 1 ? "lead" : "leads"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className="text-text-3 mb-1 block font-mono text-micro tracking-field uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function PreviewTable({
  rows,
  cells,
  onPatch,
  onCellKeyDown,
}: {
  rows: Row[];
  cells: React.RefObject<Map<string, HTMLInputElement>>;
  onPatch: (index: number, changes: Partial<Row>) => void;
  onCellKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    column: Column,
    index: number,
  ) => void;
}) {
  const register = (column: Column, index: number) => (node: HTMLInputElement | null) => {
    if (node) cells.current.set(`${column}:${index}`, node);
    else cells.current.delete(`${column}:${index}`);
  };

  const cell =
    "border-hairline text-text-1 w-full border-b border-dashed bg-transparent px-1 py-0.5 font-sans text-tiny outline-none";

  return (
    <div className="border-hairline rounded-control scrollbar-thin max-h-72 overflow-y-auto border">
      <table className="w-full border-collapse">
        <thead className="bg-surface-1 sticky top-0 z-10">
          <tr className="text-text-3 font-mono text-micro tracking-field uppercase">
            <th className="w-7 px-2 py-1.5" />
            <th className="px-2 py-1.5 text-left font-medium">Name</th>
            <th className="px-2 py-1.5 text-left font-medium">Company</th>
            <th className="px-2 py-1.5 text-left font-medium">Niche</th>
            <th className="px-2 py-1.5 text-left font-medium">Instagram</th>
            <th className="w-14 px-2 py-1.5 text-left font-medium">Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const instagram = row.links.find((link) => link.platform === "instagram");
            return (
              <React.Fragment key={row.key}>
                <tr className="border-hairline-soft border-t align-middle">
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(event) => onPatch(index, { include: event.target.checked })}
                      aria-label={`Include ${row.name}`}
                      className="accent-text-2 size-3"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={register("name", index)}
                      value={row.name}
                      onChange={(event) => onPatch(index, { name: event.target.value })}
                      onKeyDown={(event) => onCellKeyDown(event, "name", index)}
                      aria-label={`Name, row ${index + 1}`}
                      className={cn(
                        cell,
                        // A name the parser had to guess at reads as a guess.
                        row.confidence === "LOW" && "text-text-2 italic",
                      )}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={register("company", index)}
                      value={row.company}
                      onChange={(event) => onPatch(index, { company: event.target.value })}
                      onKeyDown={(event) => onCellKeyDown(event, "company", index)}
                      aria-label={`Company, row ${index + 1}`}
                      className={cell}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      ref={register("niche", index)}
                      value={row.niche}
                      onChange={(event) => onPatch(index, { niche: event.target.value })}
                      onKeyDown={(event) => onCellKeyDown(event, "niche", index)}
                      aria-label={`Niche, row ${index + 1}`}
                      className={cell}
                    />
                  </td>
                  <td className="text-text-2 truncate px-2 py-1 font-sans text-tiny">
                    {instagram ? shortenLink(instagram) : ""}
                    {row.duplicate ? (
                      <span className="text-signal-warm ml-1.5 font-mono text-micro tracking-badge uppercase">
                        dup
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => onPatch(index, { expanded: !row.expanded })}
                      aria-expanded={row.expanded}
                      aria-label={`${row.expanded ? "Hide" : "Show"} links for row ${index + 1}`}
                      className="motion-fast text-text-2 hover:text-text-1 font-mono text-micro underline decoration-dotted underline-offset-2 outline-none"
                    >
                      {row.links.length}
                    </button>
                  </td>
                </tr>

                {row.expanded ? (
                  <tr className="bg-surface-1">
                    <td />
                    <td colSpan={5} className="px-2 py-1.5">
                      <div className="space-y-1">
                        {row.links.map((link, linkIndex) => (
                          <div key={linkIndex} className="flex items-center gap-1.5">
                            <Select
                              value={link.platform}
                              onValueChange={(platform: LinkPlatform) =>
                                onPatch(index, {
                                  links: row.links.map((candidate, i) =>
                                    i === linkIndex ? { ...candidate, platform } : candidate,
                                  ),
                                })
                              }
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
                            <input
                              value={link.url}
                              onChange={(event) =>
                                onPatch(index, {
                                  links: row.links.map((candidate, i) =>
                                    i === linkIndex
                                      ? { ...candidate, url: event.target.value }
                                      : candidate,
                                  ),
                                })
                              }
                              aria-label={`Link ${linkIndex + 1} for row ${index + 1}`}
                              className={cn(cell, "font-mono text-micro")}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                onPatch(index, {
                                  links: row.links.filter((_, i) => i !== linkIndex),
                                })
                              }
                              aria-label={`Remove link ${linkIndex + 1} from row ${index + 1}`}
                              className="motion-fast text-text-3 hover:text-signal-hot shrink-0 outline-none"
                            >
                              <Trash2 className="size-3" strokeWidth={1} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
