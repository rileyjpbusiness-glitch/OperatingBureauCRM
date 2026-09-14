import type { ValueType } from "@/lib/db/enums";

const MONTHS_PER_YEAR = 12;

/**
 * Deals carry three incompatible kinds of number. Column totals normalize them
 * to a single 12-month figure so a $3k/mo retainer and a $3k one-off stop
 * looking identical.
 *
 * - monthly_recurring: 12 months of it
 * - rev_share_estimate: also a monthly estimate, so also 12 months
 * - one_time: itself
 */
export function annualizedCents(valueCents: number, type: ValueType): number {
  switch (type) {
    case "monthly_recurring":
    case "rev_share_estimate":
      return valueCents * MONTHS_PER_YEAR;
    case "one_time":
      return valueCents;
  }
}

/**
 * The recurring slice only. A one-off contributes nothing to MRR.
 */
export function monthlyRecurringCents(
  valueCents: number,
  type: ValueType,
): number {
  switch (type) {
    case "monthly_recurring":
    case "rev_share_estimate":
      return valueCents;
    case "one_time":
      return 0;
  }
}
