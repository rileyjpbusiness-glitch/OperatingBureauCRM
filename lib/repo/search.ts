import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { contacts, deals, pipelines, stages } from "@/lib/db/schema";

import { notBinned, searchPredicate } from "./filters";

/** Enough to jump to a lead, and nothing the dropdown does not show. */
export type LeadSuggestion = {
  dealId: string;
  name: string;
  /** Company, handle, or null when the lead has neither. */
  org: string | null;
  stageName: string;
  pipelineSlug: string;
};

/** Below this a query matches most of the database and the list is noise. */
export const SUGGEST_MIN_LENGTH = 3;
const SUGGEST_LIMIT = 8;

/**
 * Leads matching what has been typed so far, best match first.
 *
 * The database does the matching -- the same contains-match the board filter
 * uses, so the dropdown can never offer a lead the filtered board then hides --
 * and the ranking happens here, because "starts with" is what someone typing a
 * name means and SQL LIKE cannot express the preference in one pass.
 */
export async function suggestLeads(term: string): Promise<LeadSuggestion[]> {
  const trimmed = term.trim();
  if (trimmed.length < SUGGEST_MIN_LENGTH) return [];

  const predicate = searchPredicate(trimmed);
  if (!predicate) return [];

  const rows = db
    .select({
      dealId: deals.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      handle: contacts.instagramHandle,
      stageName: stages.name,
      pipelineSlug: pipelines.slug,
    })
    .from(deals)
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .innerJoin(stages, eq(stages.id, deals.stageId))
    .innerJoin(pipelines, eq(pipelines.id, deals.pipelineId))
    .where(and(notBinned(), predicate))
    .all();

  const needle = trimmed.toLowerCase();

  function rank(name: string, org: string | null): number {
    const full = name.toLowerCase();
    if (full.startsWith(needle)) return 0;
    // Typing a surname should find someone as readily as typing their first.
    if (full.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
    if (full.includes(needle)) return 2;
    if ((org ?? "").toLowerCase().startsWith(needle)) return 3;
    return 4;
  }

  return rows
    .map((row) => {
      const name = [row.firstName, row.lastName].filter(Boolean).join(" ");
      const org = row.company ?? row.handle ?? null;
      return {
        suggestion: {
          dealId: row.dealId,
          name,
          org,
          stageName: row.stageName,
          pipelineSlug: row.pipelineSlug,
        },
        rank: rank(name, org),
      };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || a.suggestion.name.localeCompare(b.suggestion.name),
    )
    .slice(0, SUGGEST_LIMIT)
    .map((row) => row.suggestion);
}
