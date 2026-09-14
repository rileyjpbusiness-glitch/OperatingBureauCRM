import type { Owner } from "@/lib/db/enums";
import { OWNERS } from "@/lib/db/enums";
import type { DealFilters } from "@/lib/repo/types";

export type PageSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isOwner(value: string | undefined): value is Owner {
  return value !== undefined && (OWNERS as readonly string[]).includes(value);
}

/** The board's whole view state lives in the query string. */
export function readViewState(params: PageSearchParams): {
  filters: DealFilters;
  showStats: boolean;
  dealId: string | null;
} {
  const search = one(params["q"]);
  const owner = one(params["owner"]);

  return {
    filters: {
      ...(search ? { search } : {}),
      ...(isOwner(owner) ? { owner } : {}),
    },
    showStats: one(params["stats"]) === "1",
    dealId: one(params["deal"]) ?? null,
  };
}
