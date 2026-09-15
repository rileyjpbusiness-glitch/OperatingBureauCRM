import { asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { contactLinks, contacts } from "@/lib/db/schema";
import {
  classifyUrl,
  ensureProtocol,
  normalizeInstagramUrl,
  parseUrl,
  sortLinks,
  type LeadLink,
  type LinkPlatform,
} from "@/lib/links";

/** Links for a set of contacts, already in display order. */
export async function linksByContactId(
  ids: string[],
): Promise<Map<string, LeadLink[]>> {
  const map = new Map<string, LeadLink[]>();
  if (ids.length === 0) return map;

  const rows = db
    .select()
    .from(contactLinks)
    .where(inArray(contactLinks.contactId, ids))
    .orderBy(asc(contactLinks.position), asc(contactLinks.createdAt))
    .all();

  for (const row of rows) {
    const list = map.get(row.contactId) ?? [];
    list.push({
      id: row.id,
      platform: row.platform,
      url: row.url,
      label: row.label,
    });
    map.set(row.contactId, list);
  }
  for (const [id, list] of map) map.set(id, sortLinks(list));
  return map;
}

export async function listLinks(contactId: string): Promise<LeadLink[]> {
  return (await linksByContactId([contactId])).get(contactId) ?? [];
}

function nextPosition(contactId: string): number {
  const row = db
    .select({ max: sql<number | null>`max(${contactLinks.position})` })
    .from(contactLinks)
    .where(eq(contactLinks.contactId, contactId))
    .get();
  return (row?.max ?? -1) + 1;
}

export async function addLink(input: {
  contactId: string;
  platform?: LinkPlatform;
  url?: string;
  label?: string | null;
}): Promise<LeadLink> {
  const url = input.url ? ensureProtocol(input.url) : "";
  const row = {
    id: newId("clink"),
    contactId: input.contactId,
    // A new empty row defaults to instagram, which is what it usually is.
    platform: input.platform ?? (url ? classifyUrl(url) : "instagram"),
    url,
    label: input.label ?? null,
    position: nextPosition(input.contactId),
    createdAt: new Date(),
  };
  db.insert(contactLinks).values(row).run();
  return { id: row.id, platform: row.platform, url: row.url, label: row.label };
}

export async function updateLink(
  id: string,
  patch: { platform?: LinkPlatform; url?: string; label?: string | null },
): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.platform !== undefined) next.platform = patch.platform;
  // Typed but unparseable text is kept as typed; the drawer renders it as plain
  // text rather than a broken anchor.
  if (patch.url !== undefined) next.url = ensureProtocol(patch.url);
  if (patch.label !== undefined) next.label = patch.label || null;
  if (Object.keys(next).length === 0) return;
  db.update(contactLinks).set(next).where(eq(contactLinks.id, id)).run();
}

export async function deleteLink(id: string): Promise<void> {
  db.delete(contactLinks).where(eq(contactLinks.id, id)).run();
}

/** Every Instagram URL already on the board, in comparable form. */
export async function existingInstagramUrls(): Promise<Set<string>> {
  const rows = db
    .select({ url: contactLinks.url })
    .from(contactLinks)
    .where(eq(contactLinks.platform, "instagram"))
    .all();

  const set = new Set<string>();
  for (const row of rows) {
    const normalized = normalizeInstagramUrl(row.url);
    if (normalized) set.add(normalized);
  }
  return set;
}

/**
 * Turns each contact's old instagram_handle into a link row, once.
 *
 * Runs on every boot and does nothing after the first: a contact is skipped if
 * it is flagged, and flagged whether or not it produced a link, so an empty
 * handle is not reconsidered forever. The handle column itself is left alone,
 * so this is safe against a restored backup and safe to run twice.
 *
 * Returns what it did, so the boot log says so rather than staying silent.
 */
export async function backfillLinks(): Promise<{
  scanned: number;
  linked: number;
}> {
  return db.transaction((tx) => {
    const pending = tx
      .select({ id: contacts.id, handle: contacts.instagramHandle })
      .from(contacts)
      .where(eq(contacts.linksBackfilled, false))
      .all();
    if (pending.length === 0) return { scanned: 0, linked: 0 };

    // A contact that already has links was imported rather than migrated, and
    // must not gain a second Instagram row from its own handle.
    const withLinks = new Set(
      tx
        .selectDistinct({ contactId: contactLinks.contactId })
        .from(contactLinks)
        .where(
          inArray(
            contactLinks.contactId,
            pending.map((row) => row.id),
          ),
        )
        .all()
        .map((row) => row.contactId),
    );

    const now = new Date();
    let linked = 0;

    for (const contact of pending) {
      const handle = (contact.handle ?? "").trim();
      if (handle && !withLinks.has(contact.id)) {
        // A handle that is already a URL keeps its own platform; a bare handle
        // is an Instagram account, which is what the field always meant.
        const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(handle);
        const url = looksLikeUrl
          ? ensureProtocol(handle)
          : `https://www.instagram.com/${handle.replace(/^@+/, "")}/`;
        const platform = looksLikeUrl ? classifyUrl(url) : "instagram";

        tx.insert(contactLinks)
          .values({
            id: newId("clink"),
            contactId: contact.id,
            platform,
            url,
            label:
              platform === "other" ? (parseUrl(url)?.hostname ?? null) : null,
            position: 0,
            createdAt: now,
          })
          .run();
        linked += 1;
      }

      tx.update(contacts)
        .set({ linksBackfilled: true })
        .where(eq(contacts.id, contact.id))
        .run();
    }

    return { scanned: pending.length, linked };
  });
}

/** How many contacts still carry a handle that never became a link. */
export async function countUnbackfilled(): Promise<number> {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.linksBackfilled, false))
    .get();
  return row?.count ?? 0;
}

