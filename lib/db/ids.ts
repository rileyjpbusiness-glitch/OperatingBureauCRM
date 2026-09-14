import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford base32, no i/l/o/u

/**
 * Prefixed, lexicographically sortable ids: `deal_01jf3k2m8q4t7v`.
 *
 * The first 10 characters encode the millisecond timestamp, so ids sort in
 * creation order and a plain string index doubles as a rough time index. The
 * remaining characters are random. Text ids move to Postgres unchanged and let
 * the seed build an entire object graph in memory before touching the database.
 */
export function newId(prefix: string): string {
  let time = Date.now();
  let timePart = "";
  for (let i = 0; i < 10; i += 1) {
    timePart = ALPHABET[time % 32] + timePart;
    time = Math.floor(time / 32);
  }

  const bytes = randomBytes(8);
  let randomPart = "";
  for (const byte of bytes) {
    randomPart += ALPHABET[byte % 32];
  }

  return `${prefix}_${timePart}${randomPart}`;
}
