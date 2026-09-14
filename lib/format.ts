import type * as React from "react";

import {
  daysBetween,
  formatDate,
  formatDateTime as formatZonedDateTime,
} from "@/lib/dates";
import type { Owner, ValueType } from "@/lib/db/enums";

/**
 * Column headers are 280px wide and carry four numbers, so money there is
 * compact: $162k rather than $162,000. Cards have room for the real figure.
 */
/** Drops a trailing ".0" so 4.0 reads as 4 but 10.5 keeps its half. */
function trim(value: number, places: number): string {
  return value.toFixed(places).replace(/\.0+$/, "");
}

export function formatCentsCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars === 0) return "$0";
  if (Math.abs(dollars) >= 1_000_000) {
    return `$${trim(dollars / 1_000_000, 1)}M`;
  }
  if (Math.abs(dollars) >= 100_000) {
    // Past six figures the half-thousand is noise.
    return `$${Math.round(dollars / 1_000)}k`;
  }
  if (Math.abs(dollars) >= 1_000) {
    return `$${trim(dollars / 1_000, 1)}k`;
  }
  return `$${Math.round(dollars)}`;
}

export function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

const VALUE_TYPE_SUFFIX: Record<ValueType, string> = {
  monthly_recurring: "/mo",
  one_time: " once",
  // A rev-share estimate reads the same as a retainer; the muted colour on the
  // card is what marks it as a guess.
  rev_share_estimate: "/mo",
};

export function formatDealValue(cents: number, type: ValueType): string {
  return `${formatCents(cents)}${VALUE_TYPE_SUFFIX[type]}`;
}

/** Rendered muted rather than suffixed, so the format stays uniform. */
export function isEstimatedValue(type: ValueType): boolean {
  return type === "rev_share_estimate";
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** "4.2d" reads faster than "4.2 days" in a header that is already dense. */
export function formatDays(days: number): string {
  return days >= 10 ? `${Math.round(days)}d` : `${trim(days, 1)}d`;
}

const OWNER_INITIALS: Record<Owner, string> = { riley: "R", kavi: "K" };

export function ownerInitial(owner: Owner): string {
  return OWNER_INITIALS[owner];
}

export function contactName(contact: {
  firstName: string;
  lastName: string | null;
}): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
}

/**
 * Two formats, not four. Inside a week either way it is relative, because that
 * is the window you act on; beyond it, an absolute date, because "in 23d" is
 * not something anyone reads as a date.
 *
 * "Today" means today in the business timezone, not in the timezone of whoever
 * is looking, so Riley and Kavi read the same card the same way.
 */
export function formatDueDate(date: Date, now: Date = new Date()): string {
  const days = daysBetween(now, date);

  if (days === 0) return "today";
  if (days < 0) {
    return days >= -7 ? `${Math.abs(days)}d overdue` : formatDate(date);
  }
  return days <= 7 ? `in ${days}d` : formatDate(date);
}

export function formatDateTime(date: Date): string {
  return formatZonedDateTime(date);
}

/**
 * The card's left edge, as two plain numbers for the `.silt` utility to colour.
 *
 * Clean until a deal is halfway to its stage's threshold, warming from there,
 * shifting to hot between one and two times over, solid past that. A column
 * where work is piling up glows down its left side before you read a number.
 */
export function siltStyle(pressure: number | null): React.CSSProperties {
  if (pressure === null || pressure <= 0.5) {
    return { "--silt-opacity": 0, "--silt-mix": 0 } as React.CSSProperties;
  }

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  if (pressure <= 1) {
    // Fading up through the second half of the stage's allowance.
    return {
      "--silt-opacity": clamp((pressure - 0.5) / 0.5) * 0.55,
      "--silt-mix": 0,
    } as React.CSSProperties;
  }

  if (pressure <= 2) {
    const through = clamp(pressure - 1);
    return {
      "--silt-opacity": 0.55 + through * 0.45,
      "--silt-mix": through,
    } as React.CSSProperties;
  }

  return { "--silt-opacity": 1, "--silt-mix": 1 } as React.CSSProperties;
}
