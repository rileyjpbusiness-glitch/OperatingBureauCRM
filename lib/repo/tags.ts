import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { contactTags, tags } from "@/lib/db/schema";

import type { Tag } from "./types";

const TAG_COLORS = [
  "#6366f1",
  "#14b8a6",
  "#f59e0b",
  "#ec4899",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#0ea5e9",
] as const;

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TAG_COLORS[hash % TAG_COLORS.length] ?? "#6366f1";
}

export async function listTags(): Promise<Tag[]> {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .orderBy(asc(tags.name))
    .all();
}

export async function getOrCreateTag(
  name: string,
  color?: string,
): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name cannot be empty");

  const existing = db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(eq(tags.name, trimmed))
    .get();
  if (existing) return existing;

  const row: Tag = {
    id: newId("tag"),
    name: trimmed,
    color: color ?? colorForName(trimmed),
  };
  db.insert(tags).values({ ...row, createdAt: new Date() }).run();
  return row;
}

export async function deleteTag(id: string): Promise<void> {
  db.delete(tags).where(eq(tags.id, id)).run();
}

/** Replaces a contact's tags wholesale. */
export async function setContactTags(
  contactId: string,
  tagIds: string[],
): Promise<void> {
  const unique = [...new Set(tagIds)];
  db.transaction((tx) => {
    tx.delete(contactTags).where(eq(contactTags.contactId, contactId)).run();
    if (unique.length > 0) {
      tx.insert(contactTags)
        .values(unique.map((tagId) => ({ contactId, tagId })))
        .run();
    }
  });
}

/**
 * One query for many contacts. Loading tags per row is the easiest way to turn
 * a board render into a hundred round trips.
 */
export async function tagsByContactId(
  contactIds: string[],
): Promise<Map<string, Tag[]>> {
  const result = new Map<string, Tag[]>();
  if (contactIds.length === 0) return result;

  const rows = db
    .select({
      contactId: contactTags.contactId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(inArray(contactTags.contactId, contactIds))
    .orderBy(asc(tags.name))
    .all();

  for (const row of rows) {
    const list = result.get(row.contactId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    result.set(row.contactId, list);
  }
  return result;
}
