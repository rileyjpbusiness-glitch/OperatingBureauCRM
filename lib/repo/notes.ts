import { desc, eq } from "drizzle-orm";

import type { Owner } from "@/lib/db/enums";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { notes } from "@/lib/db/schema";

import { writeActivity } from "./activity-log";
import type { Note } from "./types";

/** Pinned notes first, then newest first. */
export async function listNotes(dealId: string): Promise<Note[]> {
  return db
    .select()
    .from(notes)
    .where(eq(notes.dealId, dealId))
    .orderBy(desc(notes.pinned), desc(notes.createdAt))
    .all();
}

export async function createNote(input: {
  dealId: string;
  body: string;
  author: Owner;
  pinned?: boolean;
  createdAt?: Date;
}): Promise<Note> {
  const now = input.createdAt ?? new Date();
  const row: Note = {
    id: newId("note"),
    dealId: input.dealId,
    body: input.body,
    author: input.author,
    pinned: input.pinned ?? false,
    createdAt: now,
    updatedAt: now,
  };

  return db.transaction((tx) => {
    tx.insert(notes).values(row).run();
    writeActivity(tx, {
      dealId: input.dealId,
      type: "note_added",
      meta: { noteId: row.id, author: row.author, excerpt: excerpt(row.body) },
      at: now,
    });
    return row;
  });
}

export async function updateNote(
  id: string,
  patch: { body?: string; pinned?: boolean },
): Promise<Note | null> {
  const next: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.body !== undefined) next.body = patch.body;
  if (patch.pinned !== undefined) next.pinned = patch.pinned;

  db.update(notes).set(next).where(eq(notes.id, id)).run();
  return db.select().from(notes).where(eq(notes.id, id)).get() ?? null;
}

export async function deleteNote(id: string): Promise<void> {
  db.delete(notes).where(eq(notes.id, id)).run();
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}
