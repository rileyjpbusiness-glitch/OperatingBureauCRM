import type { ActivityType } from "@/lib/db/enums";
import type { Db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { activities } from "@/lib/db/schema";

import type { Activity, ActivityMeta } from "./types";

/** Either the pooled handle or an open transaction. */
type TxHandle = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbHandle = Db | TxHandle;

export type ActivityInput = {
  dealId: string;
  type: ActivityType;
  fromStageId?: string | null;
  toStageId?: string | null;
  meta?: ActivityMeta | null;
  /** The seed backdates its history; live mutations leave this alone. */
  at?: Date;
};

/**
 * The only writer of the activities table. Mutating functions call this inside
 * their own transaction so the row and the change it describes commit together.
 * Nothing edits activities after the fact.
 */
export function writeActivity(
  handle: DbHandle,
  input: ActivityInput,
): Activity {
  const row = {
    id: newId("act"),
    dealId: input.dealId,
    type: input.type,
    fromStageId: input.fromStageId ?? null,
    toStageId: input.toStageId ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    createdAt: input.at ?? new Date(),
  };

  handle.insert(activities).values(row).run();

  return { ...row, meta: input.meta ?? null };
}

export function parseActivityMeta(raw: string | null): ActivityMeta | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ActivityMeta;
    }
    return null;
  } catch {
    return null;
  }
}
