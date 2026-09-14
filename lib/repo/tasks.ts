import { asc, eq } from "drizzle-orm";

import type { Owner } from "@/lib/db/enums";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { tasks } from "@/lib/db/schema";

import type { Task } from "./types";

export async function listTasks(dealId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.dealId, dealId))
    .orderBy(asc(tasks.completedAt), asc(tasks.dueAt))
    .all();
}

export async function createTask(input: {
  dealId: string;
  title: string;
  owner: Owner;
  dueAt?: Date | null;
  createdAt?: Date;
}): Promise<Task> {
  const row: Task = {
    id: newId("task"),
    dealId: input.dealId,
    title: input.title.trim(),
    dueAt: input.dueAt ?? null,
    completedAt: null,
    owner: input.owner,
    createdAt: input.createdAt ?? new Date(),
  };
  db.insert(tasks).values(row).run();
  return row;
}

export async function setTaskCompleted(
  id: string,
  completed: boolean,
): Promise<Task | null> {
  db.update(tasks)
    .set({ completedAt: completed ? new Date() : null })
    .where(eq(tasks.id, id))
    .run();
  return db.select().from(tasks).where(eq(tasks.id, id)).get() ?? null;
}

export async function deleteTask(id: string): Promise<void> {
  db.delete(tasks).where(eq(tasks.id, id)).run();
}
