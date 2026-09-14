import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pipelines } from "@/lib/db/schema";

import type { Pipeline } from "./types";

/**
 * Repository functions are async even though better-sqlite3 is synchronous.
 * Postgres drivers are not, and the point of this layer is that swapping the
 * database does not reach into the UI.
 */

export async function listPipelines(): Promise<Pipeline[]> {
  return db.select().from(pipelines).orderBy(asc(pipelines.position)).all();
}

export async function getPipelineBySlug(
  slug: string,
): Promise<Pipeline | null> {
  const row = db
    .select()
    .from(pipelines)
    .where(eq(pipelines.slug, slug))
    .get();
  return row ?? null;
}

export async function getPipelineById(id: string): Promise<Pipeline | null> {
  const row = db.select().from(pipelines).where(eq(pipelines.id, id)).get();
  return row ?? null;
}

export async function createPipeline(input: {
  name: string;
  slug: string;
}): Promise<Pipeline> {
  const existing = await listPipelines();
  const maxPosition = existing.reduce(
    (max, pipeline) => Math.max(max, pipeline.position),
    -1,
  );

  const row: Pipeline = {
    id: newId("pipe"),
    name: input.name,
    slug: input.slug,
    position: maxPosition + 1,
    createdAt: new Date(),
  };

  db.insert(pipelines).values(row).run();
  return row;
}
