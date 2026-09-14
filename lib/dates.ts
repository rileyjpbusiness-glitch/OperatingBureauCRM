/**
 * Every date decision in the app resolves in one timezone, not the timezone of
 * whoever happens to be looking. Two people in different countries have to
 * agree on what "today", "overdue" and "this week" mean, or the same board
 * shows them different work.
 *
 * Change this one line to move the business day.
 */
export const TIME_ZONE = "America/New_York";

const MS_PER_DAY = 86_400_000;

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** The wall-clock reading in TIME_ZONE at a given instant. */
function partsAt(instant: Date): Parts {
  const found: Record<string, string> = {};
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found["year"]),
    month: Number(found["month"]),
    day: Number(found["day"]),
    // Intl reports midnight as hour 24 in some runtimes.
    hour: Number(found["hour"]) % 24,
    minute: Number(found["minute"]),
    second: Number(found["second"]),
  };
}

/** How far TIME_ZONE is from UTC at a given instant, in milliseconds. */
function offsetAt(instant: Date): number {
  const parts = partsAt(instant);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a given wall-clock time in TIME_ZONE occurs.
 *
 * Resolved in two passes: the offset in force right now is a good guess, but on
 * the two days a year the clocks move, the offset at the guessed instant is the
 * one that actually applies.
 */
function instantOf(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const firstGuess = naive - offsetAt(new Date(naive));
  return new Date(naive - offsetAt(new Date(firstGuess)));
}

/**
 * The calendar day as a plain integer, counted in TIME_ZONE. Comparing two of
 * these answers "same day", "before today" and "how many days apart" without
 * any instant arithmetic, which is where timezone bugs live.
 */
export function dayNumber(instant: Date): number {
  const parts = partsAt(instant);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / MS_PER_DAY);
}

export function startOfDay(instant: Date): Date {
  const parts = partsAt(instant);
  return instantOf(parts.year, parts.month, parts.day);
}

export function endOfDay(instant: Date): Date {
  const parts = partsAt(instant);
  // Date.UTC rolls the month and year over for us.
  return new Date(instantOf(parts.year, parts.month, parts.day + 1).getTime() - 1);
}

/** Start of the day `days` before the one containing `instant`. */
export function startOfDaysAgo(instant: Date, days: number): Date {
  const parts = partsAt(instant);
  return instantOf(parts.year, parts.month, parts.day - days);
}

/** Calendar days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

export function isOverdue(date: Date | null, now: Date): boolean {
  if (!date) return false;
  return date.getTime() < now.getTime();
}

export function isDueToday(date: Date | null, now: Date): boolean {
  if (!date) return false;
  return dayNumber(date) === dayNumber(now);
}

/**
 * Anything scheduled for today or earlier is owed now. Overdue and due-today
 * are the same call to action, so they are counted together everywhere.
 */
export function isDueOrOverdue(date: Date | null, now: Date): boolean {
  if (!date) return false;
  return dayNumber(date) <= dayNumber(now);
}

/** The seven day window ending tonight, today included. */
export function thisWeek(now: Date): { start: Date; end: Date } {
  return { start: startOfDaysAgo(now, 6), end: endOfDay(now) };
}

/** A rolling window of `days` whole days ending tonight. */
export function lastDays(now: Date, days: number): { start: Date; end: Date } {
  return { start: startOfDaysAgo(now, days - 1), end: endOfDay(now) };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Rendering goes through the same zone, so the server and the browser produce
 * the same string. Formatting in the host's locale would also mean a React
 * hydration mismatch whenever the two disagree.
 */
export function formatDate(instant: Date): string {
  return DATE_FORMAT.format(instant);
}

export function formatDateTime(instant: Date): string {
  return DATE_TIME_FORMAT.format(instant);
}

/** `YYYY-MM-DD` as read in TIME_ZONE, for a native date input. */
export function toDateInputValue(instant: Date): string {
  const parts = partsAt(instant);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * A date input hands back `YYYY-MM-DD`. `new Date(...)` would read that as UTC
 * midnight, which in New York is the evening before, so picking the 20th would
 * store the 19th.
 */
export function fromDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return instantOf(Number(year), Number(month), Number(day));
}

/**
 * The same calendar day in TIME_ZONE, at the given wall-clock time. The seed
 * uses it so generated history lands during New York business hours whatever
 * clock the machine running the seed is set to.
 */
export function atZonedTime(
  instant: Date,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  const parts = partsAt(instant);
  return instantOf(parts.year, parts.month, parts.day, hour, minute, second);
}

/** Start of the month containing `instant`, `back` months earlier. */
export function startOfMonthsAgo(instant: Date, back: number): Date {
  const parts = partsAt(instant);
  // Date.UTC rolls a negative month back into the previous year for us.
  return instantOf(parts.year, parts.month - back, 1);
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
});

export function formatMonthLabel(instant: Date): string {
  return MONTH_FORMAT.format(instant);
}

export function formatDayLabel(instant: Date): string {
  return DAY_FORMAT.format(instant);
}
