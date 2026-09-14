"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createLeadAction } from "@/lib/actions";
import { OWNERS, SOURCES } from "@/lib/db/enums";
import type { Owner, Source } from "@/lib/db/enums";
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

/** Creates the contact and its deal in one shot, at the top of the pipeline. */
export function NewLeadDialog({
  open,
  onOpenChange,
  pipelineId,
  stageId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  stageId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<Source>("ig_dm");
  const [owner, setOwner] = React.useState<Owner>("riley");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const [firstName, ...restName] = name.split(/\s+/);
    if (!firstName) {
      setError("A name is required");
      return;
    }

    const value = Number(form.get("value") ?? 0);
    setPending(true);
    setError(null);
    try {
      await createLeadAction({
        pipelineId,
        stageId,
        firstName,
        lastName: restName.join(" "),
        company: String(form.get("company") ?? "").trim(),
        handle: String(form.get("handle") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        valueDollars: Number.isFinite(value) ? value : 0,
        source,
        owner,
      });
      onOpenChange(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-sm font-semibold">New lead</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-0.5 text-[11px]">
          Creates the contact and a deal at the top of the pipeline.
        </DialogDescription>

        <form onSubmit={handleSubmit} className="mt-3 space-y-2">
          <Input name="name" placeholder="Name" autoFocus required />
          <Input name="company" placeholder="Company" />
          <div className="grid grid-cols-2 gap-2">
            <Input name="handle" placeholder="@handle" />
            <Input name="email" type="email" placeholder="Email" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input
              name="value"
              type="number"
              min="0"
              step="100"
              placeholder="$ / mo"
            />
            <Select
              value={source}
              onValueChange={(next) => setSource(next as Source)}
            >
              <SelectTrigger aria-label="Source">
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
            <Select
              value={owner}
              onValueChange={(next) => setOwner(next as Owner)}
            >
              <SelectTrigger aria-label="Owner">
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
          </div>

          {error ? (
            <p className="text-destructive text-[11px]">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Add lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
