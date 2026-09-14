"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  moveDealAction,
  updateContactAction,
  updateDealAction,
} from "@/lib/actions";
import { OWNERS, SOURCES, VALUE_TYPES, type Owner } from "@/lib/db/enums";
import type { DealDetail } from "@/lib/repo/types";
import {
  contactName,
  formatDealValue,
  formatDueDate,
  isEstimatedValue,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { SOURCE_LABELS } from "@/components/board/source-icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { HistoryTab } from "./history-tab";
import { InlineField } from "./inline-field";
import { NotesTab } from "./notes-tab";

const VALUE_TYPE_LABELS = {
  monthly_recurring: "per month",
  one_time: "one-time",
  rev_share_estimate: "rev share est.",
} as const;

function Row({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[92px_1fr] items-center gap-2",
        wide && "col-span-2",
      )}
    >
      <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function toDateInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DealPanel({ detail }: { detail: DealDetail | null }) {
  const router = useRouter();
  const params = useSearchParams();

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete("deal");
    const qs = next.toString();
    router.push(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }

  if (!detail) return null;

  const { card, stages, stage } = detail;
  const contact = card.contact;

  const saveDeal = async (patch: Record<string, unknown>) => {
    await updateDealAction({ dealId: card.id, ...patch });
    router.refresh();
  };
  const saveContact = async (patch: Record<string, unknown>) => {
    await updateContactAction({ contactId: contact.id, ...patch });
    router.refresh();
  };

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent aria-describedby={undefined}>
        <div className="shrink-0 border-b px-4 py-3 pr-10">
          <SheetTitle asChild>
            <h2 className="text-sm font-semibold">{contactName(contact)}</h2>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Deal details, notes and history
          </SheetDescription>

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <Row label="Company">
              <InlineField
                value={contact.company ?? ""}
                onSave={(value) => saveContact({ company: value || null })}
              />
            </Row>
            <Row label="Stage">
              <Select
                value={stage.id}
                onValueChange={async (stageId) => {
                  await moveDealAction({
                    dealId: card.id,
                    toStageId: stageId,
                    targetIndex: 0,
                  });
                  router.refresh();
                }}
              >
                <SelectTrigger className="h-6">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Value" wide>
              <div className="flex min-w-0 items-center gap-2">
                <InlineField
                  type="number"
                  className={cn(
                    "w-24 shrink-0 font-mono",
                    isEstimatedValue(card.valueType) && "text-muted-foreground",
                  )}
                  value={String(card.value / 100)}
                  display={formatDealValue(card.value, card.valueType)}
                  onSave={(value) =>
                    saveDeal({ valueDollars: Number(value) || 0 })
                  }
                />
                <Select
                  value={card.valueType}
                  onValueChange={(valueType) => saveDeal({ valueType })}
                >
                  <SelectTrigger className="h-6 w-36 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VALUE_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {VALUE_TYPE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Row>
            <Row label="Owner">
              <Select
                value={card.owner}
                onValueChange={(owner) => saveDeal({ owner })}
              >
                <SelectTrigger className="h-6">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OWNERS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "riley" ? "Riley" : "Kavi"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* The old Details tab, inlined: nothing about a deal is a click away. */}
          <details className="group mb-3" open>
            <summary className="text-muted-foreground cursor-pointer list-none text-[10px] tracking-wide uppercase">
              Details
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <Row label="Handle">
                <InlineField
                  value={contact.instagramHandle ?? ""}
                  onSave={(value) =>
                    saveContact({ instagramHandle: value || null })
                  }
                />
              </Row>
              <Row label="Email">
                <InlineField
                  type="email"
                  value={contact.email ?? ""}
                  onSave={(value) => saveContact({ email: value || null })}
                />
              </Row>
              <Row label="Phone">
                <InlineField
                  value={contact.phone ?? ""}
                  onSave={(value) => saveContact({ phone: value || null })}
                />
              </Row>
              <Row label="Website">
                <InlineField
                  value={contact.website ?? ""}
                  onSave={(value) => saveContact({ website: value || null })}
                />
              </Row>
              <Row label="Niche">
                <InlineField
                  value={contact.niche ?? ""}
                  onSave={(value) => saveContact({ niche: value || null })}
                />
              </Row>
              <Row label="Offer">
                <InlineField
                  value={contact.offerType ?? ""}
                  onSave={(value) => saveContact({ offerType: value || null })}
                />
              </Row>
              <Row label="Source">
                <Select
                  value={contact.source}
                  onValueChange={(source) => saveContact({ source })}
                >
                  <SelectTrigger className="h-6">
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
              </Row>
              <Row label="Next action">
                <InlineField
                  value={card.nextAction ?? ""}
                  onSave={(value) => saveDeal({ nextAction: value || null })}
                />
              </Row>
              <Row label="Due">
                <InlineField
                  type="date"
                  value={toDateInput(card.nextActionAt)}
                  {...(card.nextActionAt
                    ? { display: formatDueDate(card.nextActionAt) }
                    : {})}
                  onSave={(value) =>
                    saveDeal({
                      nextActionAt: value ? new Date(value) : null,
                    })
                  }
                />
              </Row>
              {card.tags.length > 0 ? (
                <Row label="Tags">
                  <div className="flex flex-wrap gap-1">
                    {card.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded px-1 py-px text-[10px]"
                        style={{
                          backgroundColor: `${tag.color}22`,
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </Row>
              ) : null}
            </div>
          </details>

          <Tabs defaultValue="notes">
            <TabsList className="mb-3 border-b pb-2">
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="notes">
              <NotesTab
                dealId={card.id}
                notes={detail.notes}
                author={card.owner as Owner}
              />
            </TabsContent>

            <TabsContent value="history">
              <HistoryTab
                dealId={card.id}
                history={detail.history}
                stages={stages}
              />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
