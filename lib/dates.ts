import { endOfDay, startOfDay, subDays } from "date-fns";

/**
 * Anything scheduled for today or earlier is owed now. Overdue and due-today
 * are the same call to action, so they are counted together everywhere.
 *
 * date-fns does the day arithmetic rather than adding 86,400,000ms, because a
 * day is not always that long and the clocks change twice a year.
 */
export function isDueOrOverdue(date: Date | null, now: Date): boolean {
  if (!date) return false;
  return date.getTime() <= endOfDay(now).getTime();
}

export function isOverdue(date: Date | null, now: Date): boolean {
  if (!date) return false;
  return date.getTime() < now.getTime();
}

export function isDueToday(date: Date | null, now: Date): boolean {
  if (!date) return false;
  return (
    date.getTime() >= startOfDay(now).getTime() &&
    date.getTime() <= endOfDay(now).getTime()
  );
}

/** The seven day window ending tonight, today included. */
export function thisWeek(now: Date): { start: Date; end: Date } {
  return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
}

export { endOfDay, startOfDay };
