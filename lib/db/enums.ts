/**
 * Every enum in the schema lives here as a readonly tuple so Drizzle, zod, and
 * the UI all read from one definition. Adding a value is a one-line change
 * plus a migration for the CHECK constraint Drizzle emits.
 */

export const SOURCES = [
  "ig_dm",
  "cold_email",
  "referral",
  "inbound",
  "list_import",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];

/**
 * v1 has two operators and no auth. This is deliberately a plain enum rather
 * than a users table: when a third person or a real account system arrives it
 * becomes a text foreign key, which is a column type change on a handful of
 * tables rather than a rewrite of the ownership model.
 */
export const OWNERS = ["riley", "kavi"] as const;
export type Owner = (typeof OWNERS)[number];

export const VALUE_TYPES = [
  "monthly_recurring",
  "one_time",
  "rev_share_estimate",
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const TOUCH_CHANNELS = [
  "ig_dm",
  "email",
  "loom",
  "call",
  "voice_note",
  "other",
] as const;
export type TouchChannel = (typeof TOUCH_CHANNELS)[number];

export const TOUCH_DIRECTIONS = ["outbound", "inbound"] as const;
export type TouchDirection = (typeof TOUCH_DIRECTIONS)[number];

export const TOUCH_OUTCOMES = [
  "sent",
  "opened",
  "replied",
  "positive_reply",
  "objection",
  "no_response",
  "booked",
] as const;
export type TouchOutcome = (typeof TOUCH_OUTCOMES)[number];

export const ACTIVITY_TYPES = [
  "created",
  "stage_changed",
  "note_added",
  "touch_logged",
  "value_changed",
  "won",
  "lost",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * Where a touch came from. Everything v1 writes is "manual"; the enum exists so
 * an Instantly or Smartlead sync can write rows without a schema change.
 */
export const TOUCH_ORIGINS = ["manual", "sync", "import"] as const;
export type TouchOrigin = (typeof TOUCH_ORIGINS)[number];
