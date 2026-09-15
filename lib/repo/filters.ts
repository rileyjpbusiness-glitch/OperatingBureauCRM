import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { contactTags, contacts, deals, stages } from "@/lib/db/schema";

import type { DealFilters } from "./types";

const MS_PER_DAY = 86_400_000;

/**
 * A binned deal is off every board and out of every figure. It is still a row,
 * because the bin can be emptied later and not before, so every read of deals
 * has to say so explicitly -- there is no "deleted" status to forget about.
 *
 * Exported rather than inlined so the places that cannot go through
 * dealFilterConditions (the metrics joins, the KPI windows, the stage counts)
 * are visibly using the same rule.
 */
export function notBinned(): SQL {
  return isNull(deals.binnedAt) as SQL;
}

/**
 * Matches the free-text box against the four things you actually remember about
 * a lead: their name, their company, their handle, their email.
 */
export function searchPredicate(term: string): SQL | undefined {
  const trimmed = term.trim();
  if (!trimmed) return undefined;

  const pattern = `%${trimmed.toLowerCase()}%`;
  return or(
    sql`lower(${contacts.firstName}) like ${pattern}`,
    sql`lower(coalesce(${contacts.lastName}, '')) like ${pattern}`,
    sql`lower(coalesce(${contacts.firstName} || ' ' || ${contacts.lastName}, '')) like ${pattern}`,
    sql`lower(coalesce(${contacts.company}, '')) like ${pattern}`,
    sql`lower(coalesce(${contacts.instagramHandle}, '')) like ${pattern}`,
    sql`lower(coalesce(${contacts.email}, '')) like ${pattern}`,
  );
}

/**
 * A deal is stale once it has sat in its stage longer than that stage's own
 * threshold. Stages with a null threshold never go stale.
 */
export function stalePredicate(now: Date): SQL {
  return sql`${stages.staleAfterDays} is not null
    and (${now.getTime()} - ${deals.stageEnteredAt}) > ${stages.staleAfterDays} * ${MS_PER_DAY}`;
}

/**
 * Conditions for a query that has joined deals to contacts and to stages.
 * Owner reads from the deal rather than the contact: delivery can sit with a
 * different operator than the one who sourced the lead.
 */
export function dealFilterConditions(
  filters: DealFilters,
  now: Date,
): SQL[] {
  const conditions: SQL[] = [notBinned()];

  if (filters.search) {
    const predicate = searchPredicate(filters.search);
    if (predicate) conditions.push(predicate);
  }
  if (filters.owner) {
    conditions.push(eq(deals.owner, filters.owner));
  }
  if (filters.source) {
    conditions.push(eq(contacts.source, filters.source));
  }
  if (filters.tagId) {
    conditions.push(
      inArray(
        deals.contactId,
        sql`(select ${contactTags.contactId} from ${contactTags} where ${contactTags.tagId} = ${filters.tagId})`,
      ),
    );
  }
  if (filters.staleOnly) {
    conditions.push(stalePredicate(now));
  }

  return conditions;
}

export function combine(conditions: SQL[]): SQL | undefined {
  if (conditions.length === 0) return undefined;
  return and(...conditions);
}
