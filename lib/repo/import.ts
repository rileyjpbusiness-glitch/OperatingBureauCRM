import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import type { Owner, Source } from "@/lib/db/enums";
import {
  activities,
  contactLinks,
  contacts,
  deals,
  notes,
  stages,
  tasks,
  touches,
} from "@/lib/db/schema";
import { ensureProtocol, parseUrl, type LinkPlatform } from "@/lib/links";

import { writeActivity } from "./activity-log";

export type ImportLeadInput = {
  name: string;
  company: string;
  niche: string;
  links: { platform: LinkPlatform; url: string; label?: string | null }[];
};

export type ImportResult = {
  batchId: string;
  created: number;
  stageName: string;
};

/** "Jack Hagwell" splits; "Amazonwholesale" does not, and must not be forced to. */
function splitName(raw: string): { firstName: string; lastName: string | null } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "Unnamed lead", lastName: null };
  if (tokens.length === 1) return { firstName: tokens[0]!, lastName: null };
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1]!,
  };
}

/** The handle from the first Instagram link, so the contact's own field agrees. */
function handleFor(links: ImportLeadInput["links"]): string | null {
  const instagram = links.find((link) => link.platform === "instagram");
  if (!instagram) return null;
  const parsed = parseUrl(instagram.url);
  const segment = parsed?.pathname.split("/").filter(Boolean)[0];
  return segment ? `@${segment.replace(/^@/, "").toLowerCase()}` : null;
}

/**
 * Creates every lead from one import, in one transaction.
 *
 * All of it or none of it: forty-one contacts, forty-one deals and every link
 * row commit together. A half-finished import is worse than a failed one,
 * because it leaves a board you have to reconcile by hand against a document.
 *
 * Deals land at the bottom of the chosen column, so nothing already there moves
 * by a row.
 */
export async function importLeads(input: {
  leads: ImportLeadInput[];
  stageId: string;
  owner: Owner;
  source: Source;
}): Promise<ImportResult> {
  const batchId = newId("imp");

  return db.transaction((tx) => {
    const stage = tx
      .select()
      .from(stages)
      .where(eq(stages.id, input.stageId))
      .get();
    if (!stage) throw new Error(`Stage ${input.stageId} not found`);

    const now = new Date();
    const existing = tx
      .select({ max: sql<number | null>`max(${deals.position})` })
      .from(deals)
      .where(eq(deals.stageId, stage.id))
      .get();
    let position = (existing?.max ?? 0) + 1000;

    for (const lead of input.leads) {
      const { firstName, lastName } = splitName(lead.name);
      const contactId = newId("cont");

      tx.insert(contacts)
        .values({
          id: contactId,
          firstName,
          lastName,
          company: lead.company.trim() || null,
          instagramHandle: handleFor(lead.links),
          email: null,
          phone: null,
          website: null,
          niche: lead.niche.trim() || null,
          offerType: null,
          monthlyRevenueEstimate: null,
          source: input.source,
          owner: input.owner,
          notesSummary: null,
          // The links are written below; there is no handle left to convert.
          linksBackfilled: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      lead.links.forEach((link, index) => {
        const url = ensureProtocol(link.url);
        if (!url) return;
        tx.insert(contactLinks)
          .values({
            id: newId("clink"),
            contactId,
            platform: link.platform,
            url,
            label:
              link.platform === "other"
                ? (link.label ?? parseUrl(url)?.hostname ?? null)
                : null,
            position: index,
            createdAt: now,
          })
          .run();
      });

      const name = [firstName, lastName].filter(Boolean).join(" ");
      const dealId = newId("deal");
      tx.insert(deals)
        .values({
          id: dealId,
          contactId,
          pipelineId: stage.pipelineId,
          stageId: stage.id,
          title: lead.company.trim() ? `${name} - ${lead.company.trim()}` : name,
          value: 0,
          valueType: "monthly_recurring",
          status: "open",
          lostReason: null,
          priority: false,
          binnedAt: null,
          importBatchId: batchId,
          owner: input.owner,
          nextAction: null,
          nextActionAt: null,
          sequenceStep: stage.isSequence ? "day_1" : null,
          position,
          stageEnteredAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      position += 1000;

      // One entry per lead, carrying the batch, so a group stays findable and
      // the history says where the lead came from.
      writeActivity(tx, {
        dealId,
        type: "imported",
        toStageId: stage.id,
        meta: { batchId, stageId: stage.id, stageName: stage.name },
        at: now,
      });
    }

    return { batchId, created: input.leads.length, stageName: stage.name };
  });
}

export type ImportBatchSummary = {
  batchId: string;
  count: number;
  stageName: string;
  at: Date;
};

/** The most recent import still represented on the board, or null. */
export async function lastImportBatch(): Promise<ImportBatchSummary | null> {
  const latest = db
    .select({ batchId: deals.importBatchId, at: deals.createdAt })
    .from(deals)
    .where(isNotNull(deals.importBatchId))
    .orderBy(desc(deals.createdAt))
    .limit(1)
    .get();
  if (!latest?.batchId) return null;

  const rows = db
    .select({ stageName: stages.name })
    .from(deals)
    .innerJoin(stages, eq(stages.id, deals.stageId))
    .where(eq(deals.importBatchId, latest.batchId))
    .all();

  return {
    batchId: latest.batchId,
    count: rows.length,
    // Every lead in a batch lands in one stage; if one has since been moved,
    // the undo will refuse it by name rather than the summary guessing.
    stageName: rows[0]?.stageName ?? "",
    at: latest.at,
  };
}

export type UndoResult = {
  batchId: string | null;
  removed: number;
  /** Left alone because they have been worked since, with the reason why. */
  kept: { name: string; reason: string }[];
};

/**
 * Removes the most recent import, and only the parts of it you have not
 * touched.
 *
 * "Untouched" is strict on purpose: same stage, no notes, no tasks, no logged
 * touches, not binned, not flagged, and no history beyond the single entry the
 * import itself wrote. Anything else is work you have done since, and deleting
 * it to tidy up a bad paste would be the worst thing this application could do.
 * Those leads stay and come back by name.
 */
export async function undoLastImport(): Promise<UndoResult> {
  return db.transaction((tx) => {
    const latest = tx
      .select({ batchId: deals.importBatchId })
      .from(deals)
      .where(isNotNull(deals.importBatchId))
      .orderBy(desc(deals.createdAt))
      .limit(1)
      .get();
    if (!latest?.batchId) return { batchId: null, removed: 0, kept: [] };

    const batchId = latest.batchId;
    const rows = tx
      .select({ deal: deals, contact: contacts })
      .from(deals)
      .innerJoin(contacts, eq(contacts.id, deals.contactId))
      .where(eq(deals.importBatchId, batchId))
      .all();

    const removable: { dealId: string; contactId: string }[] = [];
    const kept: { name: string; reason: string }[] = [];

    for (const { deal, contact } of rows) {
      const name =
        [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
        contact.instagramHandle ||
        deal.title;

      const history = tx
        .select({ count: sql<number>`count(*)` })
        .from(activities)
        .where(eq(activities.dealId, deal.id))
        .get();
      const noteCount = tx
        .select({ count: sql<number>`count(*)` })
        .from(notes)
        .where(eq(notes.dealId, deal.id))
        .get();
      const taskCount = tx
        .select({ count: sql<number>`count(*)` })
        .from(tasks)
        .where(eq(tasks.dealId, deal.id))
        .get();
      const touchCount = tx
        .select({ count: sql<number>`count(*)` })
        .from(touches)
        .where(eq(touches.dealId, deal.id))
        .get();

      const importedStageId = (() => {
        const row = tx
          .select({ toStageId: activities.toStageId })
          .from(activities)
          .where(
            and(eq(activities.dealId, deal.id), eq(activities.type, "imported")),
          )
          .get();
        return row?.toStageId ?? null;
      })();

      const reason =
        importedStageId && deal.stageId !== importedStageId
          ? "moved to another stage"
          : (noteCount?.count ?? 0) > 0
            ? "has notes"
            : (taskCount?.count ?? 0) > 0
              ? "has tasks"
              : (touchCount?.count ?? 0) > 0
                ? "has logged touches"
                : (history?.count ?? 0) > 1
                  ? "has history since the import"
                  : deal.binnedAt !== null
                    ? "is in the bin"
                    : deal.priority
                      ? "is flagged hot"
                      : null;

      if (reason) kept.push({ name, reason });
      else removable.push({ dealId: deal.id, contactId: deal.contactId });
    }

    if (removable.length > 0) {
      tx.delete(deals)
        .where(inArray(deals.id, removable.map((row) => row.dealId)))
        .run();

      // A contact left holding no deals at all was created by this import and
      // has nothing to belong to now.
      const touched = [...new Set(removable.map((row) => row.contactId))];
      const survivors = new Set(
        tx
          .select({ contactId: deals.contactId })
          .from(deals)
          .where(inArray(deals.contactId, touched))
          .all()
          .map((row) => row.contactId),
      );
      const orphans = touched.filter((id) => !survivors.has(id));
      if (orphans.length > 0) {
        tx.delete(contacts).where(inArray(contacts.id, orphans)).run();
      }
    }

    return { batchId, removed: removable.length, kept };
  });
}
