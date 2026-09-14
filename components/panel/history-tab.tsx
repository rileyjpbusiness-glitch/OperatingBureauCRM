"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createTouchAction } from "@/lib/actions";
import {
  SEQUENCE_STEP_LABELS,
  TOUCH_CHANNELS,
  TOUCH_OUTCOMES,
  type SequenceStep,
  type TouchChannel,
  type TouchOutcome,
} from "@/lib/db/enums";
import type { HistoryEntry, Stage } from "@/lib/repo/types";
import { formatCents, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CHANNEL_LABELS: Record<TouchChannel, string> = {
  ig_dm: "IG DM",
  email: "Email",
  loom: "Loom",
  call: "Call",
  voice_note: "Voice note",
  other: "Other",
};

const OUTCOME_LABELS: Record<TouchOutcome, string> = {
  sent: "Sent",
  opened: "Opened",
  replied: "Replied",
  positive_reply: "Positive reply",
  objection: "Objection",
  no_response: "No response",
  booked: "Booked",
};

function stageName(stages: Stage[], id: string | null): string {
  if (!id) return "";
  return stages.find((stage) => stage.id === id)?.name ?? "a deleted stage";
}

function describe(entry: HistoryEntry, stages: Stage[]): string {
  if (entry.kind === "touch") {
    const { touch } = entry;
    return `${CHANNEL_LABELS[touch.channel]} ${touch.direction === "inbound" ? "in" : "out"} - ${OUTCOME_LABELS[touch.outcome]}`;
  }

  const { activity } = entry;
  const meta = activity.meta ?? {};
  switch (activity.type) {
    case "created":
      return `Created in ${stageName(stages, activity.toStageId)}`;
    case "stage_changed":
      return `${stageName(stages, activity.fromStageId)} to ${stageName(stages, activity.toStageId)}`;
    case "sequence_step_changed": {
      const to = meta["to"] as SequenceStep | null;
      const from = meta["from"] as SequenceStep | null;
      if (!to) return `Left the sequence${from ? ` at ${SEQUENCE_STEP_LABELS[from]}` : ""}`;
      return `Sequence ${from ? `${SEQUENCE_STEP_LABELS[from]} to ` : "set to "}${SEQUENCE_STEP_LABELS[to]}`;
    }
    case "note_added":
      return "Note added";
    case "value_changed": {
      const from = meta["from"] as { value?: number } | undefined;
      const to = meta["to"] as { value?: number } | undefined;
      if (typeof from?.value === "number" && typeof to?.value === "number") {
        return `Value ${formatCents(from.value)} to ${formatCents(to.value)}`;
      }
      return "Value changed";
    }
    case "won":
      return "Won";
    case "lost":
      return `Lost${meta["lostReason"] ? ` - ${String(meta["lostReason"])}` : ""}`;
    case "touch_logged":
      return "Touch logged";
  }
}

export function HistoryTab({
  dealId,
  history,
  stages,
}: {
  dealId: string;
  history: HistoryEntry[];
  stages: Stage[];
}) {
  const router = useRouter();
  const [channel, setChannel] = React.useState<TouchChannel>("ig_dm");
  const [outcome, setOutcome] = React.useState<TouchOutcome>("sent");
  const [snippet, setSnippet] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function log() {
    setPending(true);
    try {
      await createTouchAction({
        dealId,
        channel,
        outcome,
        bodySnippet: snippet.trim() || null,
      });
      setSnippet("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Direction is inferred from the outcome, and the sequence step is set
          by dragging on the sub-board, so neither is asked for here. */}
      <div className="border-hairline bg-surface-1 rounded-card flex items-center gap-1.5 border p-1.5">
        <Select
          value={channel}
          onValueChange={(next) => setChannel(next as TouchChannel)}
        >
          <SelectTrigger className="w-28 shrink-0" aria-label="Channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOUCH_CHANNELS.map((option) => (
              <SelectItem key={option} value={option}>
                {CHANNEL_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={outcome}
          onValueChange={(next) => setOutcome(next as TouchOutcome)}
        >
          <SelectTrigger className="w-36 shrink-0" aria-label="Outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOUCH_OUTCOMES.map((option) => (
              <SelectItem key={option} value={option}>
                {OUTCOME_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={snippet}
          onChange={(event) => setSnippet(event.target.value)}
          placeholder="What was said"
        />

        <Button onClick={log} disabled={pending} className="shrink-0">
          Log
        </Button>
      </div>

      {history.length === 0 ? (
        <p className="text-text-3 py-4 text-center font-mono text-micro">nothing yet</p>
      ) : (
        <ol className="space-y-1.5">
          {history.map((entry) => {
            const key =
              entry.kind === "touch" ? entry.touch.id : entry.activity.id;
            const snippetText =
              entry.kind === "touch" ? entry.touch.bodySnippet : null;

            return (
              <li key={key} className="flex gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    // Touches are things a person did; activities are things
                    // the system recorded.
                    entry.kind === "touch" ? "bg-text-2" : "bg-text-3",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        "font-sans text-tiny",
                        entry.kind === "activity" ? "text-text-3" : "text-text-1",
                      )}
                    >
                      {describe(entry, stages)}
                    </span>
                    <span className="text-text-3 shrink-0 font-mono text-micro">
                      {formatDateTime(entry.at)}
                    </span>
                  </div>
                  {snippetText ? (
                    <p className="text-text-2 mt-1 font-sans text-tiny leading-relaxed">
                      {snippetText}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
