import { asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { Owner, Source } from "@/lib/db/enums";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { contactTags, contacts, deals, stages } from "@/lib/db/schema";

import { combine, searchPredicate } from "./filters";
import { annualizedCents } from "./money";
import { tagsByContactId } from "./tags";
import type {
  Contact,
  ContactFilters,
  ContactListResult,
  ContactListRow,
  ContactSortKey,
} from "./types";

const MS_PER_DAY = 86_400_000;

export type ContactInput = {
  firstName: string;
  lastName?: string | null;
  company?: string | null;
  instagramHandle?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  niche?: string | null;
  offerType?: string | null;
  monthlyRevenueEstimate?: number | null;
  source: Source;
  owner: Owner;
  notesSummary?: string | null;
  /** The seed backdates records; live creates leave this alone. */
  createdAt?: Date;
};

function toRow(input: ContactInput): Contact {
  const now = input.createdAt ?? new Date();
  return {
    id: newId("cont"),
    firstName: input.firstName.trim(),
    lastName: input.lastName?.trim() || null,
    company: input.company?.trim() || null,
    instagramHandle: normalizeHandle(input.instagramHandle),
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    website: input.website?.trim() || null,
    niche: input.niche?.trim() || null,
    offerType: input.offerType?.trim() || null,
    monthlyRevenueEstimate: input.monthlyRevenueEstimate ?? null,
    source: input.source,
    owner: input.owner,
    notesSummary: input.notesSummary?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Scraped lists arrive with @handles, bare handles and full profile URLs. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const urlMatch = /(?:instagram\.com\/)([A-Za-z0-9._]+)/i.exec(trimmed);
  const handle = urlMatch?.[1] ?? trimmed.replace(/^@/, "");
  const cleaned = handle.replace(/\/+$/, "").trim();
  return cleaned ? `@${cleaned.toLowerCase()}` : null;
}

export async function getContact(id: string): Promise<Contact | null> {
  return db.select().from(contacts).where(eq(contacts.id, id)).get() ?? null;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const row = toRow(input);
  db.insert(contacts).values(row).run();
  return row;
}

/** One transaction for a whole CSV import rather than a round trip per row. */
export async function createContacts(
  inputs: ContactInput[],
): Promise<Contact[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map(toRow);
  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += 200) {
      tx.insert(contacts).values(rows.slice(i, i + 200)).run();
    }
  });
  return rows;
}

export async function updateContact(
  id: string,
  patch: Partial<Omit<ContactInput, "createdAt">>,
): Promise<Contact | null> {
  const next: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.firstName !== undefined) next.firstName = patch.firstName.trim();
  if (patch.lastName !== undefined) next.lastName = patch.lastName?.trim() || null;
  if (patch.company !== undefined) next.company = patch.company?.trim() || null;
  if (patch.instagramHandle !== undefined)
    next.instagramHandle = normalizeHandle(patch.instagramHandle);
  if (patch.email !== undefined)
    next.email = patch.email?.trim().toLowerCase() || null;
  if (patch.phone !== undefined) next.phone = patch.phone?.trim() || null;
  if (patch.website !== undefined) next.website = patch.website?.trim() || null;
  if (patch.niche !== undefined) next.niche = patch.niche?.trim() || null;
  if (patch.offerType !== undefined)
    next.offerType = patch.offerType?.trim() || null;
  if (patch.monthlyRevenueEstimate !== undefined)
    next.monthlyRevenueEstimate = patch.monthlyRevenueEstimate;
  if (patch.source !== undefined) next.source = patch.source;
  if (patch.owner !== undefined) next.owner = patch.owner;
  if (patch.notesSummary !== undefined)
    next.notesSummary = patch.notesSummary?.trim() || null;

  db.update(contacts).set(next).where(eq(contacts.id, id)).run();
  return getContact(id);
}

export async function deleteContact(id: string): Promise<void> {
  db.delete(contacts).where(eq(contacts.id, id)).run();
}

function contactConditions(filters: ContactFilters, now: Date): SQL[] {
  const conditions: SQL[] = [];

  if (filters.search) {
    const predicate = searchPredicate(filters.search);
    if (predicate) conditions.push(predicate);
  }
  if (filters.owner) conditions.push(eq(contacts.owner, filters.owner));
  if (filters.source) conditions.push(eq(contacts.source, filters.source));
  if (filters.tagId) {
    conditions.push(
      inArray(
        contacts.id,
        sql`(select ${contactTags.contactId} from ${contactTags} where ${contactTags.tagId} = ${filters.tagId})`,
      ),
    );
  }
  if (filters.staleOnly) {
    conditions.push(
      sql`exists (
        select 1 from ${deals}
        join ${stages} on ${stages.id} = ${deals.stageId}
        where ${deals.contactId} = ${contacts.id}
          and ${deals.status} = 'open'
          and ${stages.staleAfterDays} is not null
          and (${now.getTime()} - ${deals.stageEnteredAt}) > ${stages.staleAfterDays} * ${MS_PER_DAY}
      )`,
    );
  }

  return conditions;
}

function orderFor(sort: ContactSortKey, direction: "asc" | "desc") {
  const dir = direction === "asc" ? asc : desc;
  switch (sort) {
    case "name":
      return [dir(contacts.firstName), dir(contacts.lastName)];
    case "company":
      return [dir(contacts.company)];
    case "source":
      return [dir(contacts.source)];
    case "owner":
      return [dir(contacts.owner)];
    case "createdAt":
      return [dir(contacts.createdAt)];
    case "updatedAt":
      return [dir(contacts.updatedAt)];
  }
}

export async function listContacts(options: {
  filters?: ContactFilters;
  sort?: ContactSortKey;
  direction?: "asc" | "desc";
  limit?: number;
  offset?: number;
} = {}): Promise<ContactListResult> {
  const now = new Date();
  const filters = options.filters ?? {};
  const where = combine(contactConditions(filters, now));
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  const totalRow = db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(where)
    .get();

  const base = db.select().from(contacts).where(where).$dynamic();
  const rows = base
    .orderBy(...orderFor(options.sort ?? "updatedAt", options.direction ?? "desc"))
    .limit(limit)
    .offset(offset)
    .all();

  const ids = rows.map((row) => row.id);
  const tagMap = await tagsByContactId(ids);

  // Deal rollups are computed here rather than in SQL so annualizedCents stays
  // the single definition of what a deal is worth over a year.
  const dealRows =
    ids.length === 0
      ? []
      : db
          .select({
            contactId: deals.contactId,
            value: deals.value,
            valueType: deals.valueType,
            status: deals.status,
          })
          .from(deals)
          .where(inArray(deals.contactId, ids))
          .all();

  const rollups = new Map<
    string,
    { dealCount: number; openDealCount: number; openAnnualizedCents: number }
  >();
  for (const deal of dealRows) {
    const current = rollups.get(deal.contactId) ?? {
      dealCount: 0,
      openDealCount: 0,
      openAnnualizedCents: 0,
    };
    current.dealCount += 1;
    if (deal.status === "open") {
      current.openDealCount += 1;
      current.openAnnualizedCents += annualizedCents(deal.value, deal.valueType);
    }
    rollups.set(deal.contactId, current);
  }

  const result: ContactListRow[] = rows.map((row) => {
    const rollup = rollups.get(row.id);
    return {
      ...row,
      tags: tagMap.get(row.id) ?? [],
      dealCount: rollup?.dealCount ?? 0,
      openDealCount: rollup?.openDealCount ?? 0,
      openAnnualizedCents: rollup?.openAnnualizedCents ?? 0,
    };
  });

  return { rows: result, total: totalRow?.count ?? 0 };
}
