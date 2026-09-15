/**
 * Turns a prospecting doc into leads.
 *
 * The input is a Google Docs markdown export, which is dirty in specific,
 * repeatable ways: trailing double-spaces as soft breaks, angle-bracket
 * autolinks, markdown links wrapping the same URL twice, URLs jammed together
 * with no separator, list numbering that restarts several times in one file,
 * and blank lines in the middle of a single lead's block.
 *
 * Text only. Nothing here fetches anything.
 */
import {
  classifySocial,
  isFunnelHost,
  parseUrl,
  type LinkPlatform,
} from "@/lib/links";

export type ParsedLink = {
  platform: LinkPlatform;
  url: string;
  label: string | null;
};

export type NameConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ParsedLead = {
  name: string;
  confidence: NameConfidence;
  /** Always empty. Guessing it from a domain is worse than leaving it blank. */
  company: string;
  niche: string;
  links: ParsedLink[];
};

/* -------------------------------------------------------------------------- */
/* 2.3  Pre-clean                                                              */
/* -------------------------------------------------------------------------- */

export function preClean(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Markdown links wrap the same address twice, and only the parenthesised
    // one carries the query string.
    .replace(/\[[^\]]*\]\(([^)]+)\)/g, "$1")
    // Autolink brackets.
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .split("\n")
    // The export uses trailing double-spaces as soft breaks, which would
    // otherwise make a "blank" line non-blank.
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* 2.5  URLs                                                                   */
/* -------------------------------------------------------------------------- */

// Splits on the protocol itself rather than on whitespace, because the export
// runs URLs together with no separator at all.
const URL_PATTERN = /https?:\/\/[^\s<>\]\[()]*?(?=https?:\/\/|[\s<>\]\[()]|$)/g;
const BARE_WWW_PATTERN = /(?<![/\w.])www\.[^\s<>\]\[()]+/g;

/** Trailing punctuation the document left behind, never a query string. */
function trimArtifacts(url: string): string {
  let out = url.replace(/[.,]+$/, "");
  // A markdown link that was followed by a stray slash leaves one after the
  // query string. A plain "https://site.com/" is a real URL and keeps its slash.
  if (out.includes("?")) out = out.replace(/\/+$/, "");
  return out;
}

export function extractUrls(text: string): string[] {
  const found: string[] = [];

  // Blank out each full URL as it is taken, so the bare-www pass cannot read
  // inside one. A query string like "?typeform-source=www.youtube.com" would
  // otherwise produce a phantom YouTube link on a lead that has no such channel.
  let remaining = text;
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const url = trimArtifacts(raw);
    if (url.length > "https://".length) found.push(url);
    remaining =
      remaining.slice(0, match.index) +
      " ".repeat(raw.length) +
      remaining.slice(match.index + raw.length);
  }

  for (const match of remaining.matchAll(BARE_WWW_PATTERN)) {
    found.push(`https://${trimArtifacts(match[0])}`);
  }

  // Identical URLs within one block are one link.
  return [...new Set(found)];
}

/**
 * Files each URL. Website versus other cannot be decided per URL: it depends on
 * which unclassified one came first in this block, so it is resolved here where
 * the whole block is in hand.
 */
export function classifyBlockUrls(urls: string[]): ParsedLink[] {
  const links: ParsedLink[] = [];
  let websiteTaken = false;

  for (const url of urls) {
    const parsed = parseUrl(url);
    const host = parsed?.hostname ?? "";
    const social = host ? classifySocial(host) : null;

    if (social) {
      links.push({ platform: social, url, label: null });
      continue;
    }

    // Booking pages, forms and link-in-bio services are things the prospect
    // points at, not the site they own.
    if (!websiteTaken && host && !isFunnelHost(host)) {
      websiteTaken = true;
      links.push({ platform: "website", url, label: null });
      continue;
    }

    links.push({ platform: "other", url, label: host || null });
  }

  return links;
}

/* -------------------------------------------------------------------------- */
/* 2.6  The name                                                               */
/* -------------------------------------------------------------------------- */

const NAME_PLATFORMS: LinkPlatform[] = [
  "instagram",
  "youtube",
  "x",
  "tiktok",
  "linkedin",
];

/** Path segments that are pages, not people. */
const NON_HANDLE_SEGMENTS = new Set([
  "featured",
  "videos",
  "reels",
  "about",
  "shorts",
  "posts",
  "streams",
]);

const STOPWORDS = new Set([
  "official", "real", "the", "co", "com", "hq", "inc", "io", "ai", "tv", "yt",
  "ig", "amz", "amazon", "fba", "fbm", "ecom", "ecomm", "dropshipping",
  "ventures", "media", "agency", "store", "shop", "coaching", "business",
]);

/** The handle a social URL names, or null when it names none. */
export function handleFromUrl(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // A raw channel id is not a name, so the URL contributes nothing here.
  if (segments[0] === "channel" || segments[0] === "c") return null;

  const start = segments[0] === "in" ? 1 : 0;
  const usable = segments
    .slice(start)
    .filter((segment) => !NON_HANDLE_SEGMENTS.has(segment.toLowerCase()));

  const handle = usable[0];
  if (!handle) return null;
  // The query string is already outside pathname; the @ is not.
  return handle.replace(/^@+/, "") || null;
}

/** Tokenise a handle into the words a person's name would be made of. */
export function candidateFromHandle(handle: string): string {
  const trimmed = handle.replace(/^[_.\-]+/, "").replace(/[_.\-]+$/, "");
  const tokens = trimmed
    .split(/[_.\-]+/)
    .flatMap((part) => part.split(/(?<=[a-z0-9])(?=[A-Z])/))
    .filter(Boolean);

  const kept = tokens.filter((token) => {
    if (/^\d+$/.test(token)) return false;
    if (token.length <= 1) return false;
    return !STOPWORDS.has(token.toLowerCase());
  });

  return kept
    .map((token) => token[0]!.toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function countTokens(candidate: string): number {
  return candidate ? candidate.split(" ").filter(Boolean).length : 0;
}

/**
 * Best candidate rather than first.
 *
 * Instagram-first alone gets a whole class of these wrong: a handle like
 * "jvck.fba" survives as one token while the same person's YouTube handle
 * "JackHagwell" splits into two. Scoring and then preferring Instagram only on
 * a tie picks the readable one.
 */
export function guessName(links: ParsedLink[]): {
  name: string;
  confidence: NameConfidence;
} {
  type Candidate = { text: string; platforms: Set<LinkPlatform>; order: number };
  const byText = new Map<string, Candidate>();
  let firstHandle: string | null = null;

  for (const platform of NAME_PLATFORMS) {
    for (const link of links) {
      if (link.platform !== platform) continue;
      const handle = handleFromUrl(link.url);
      if (!handle) continue;
      if (firstHandle === null) firstHandle = handle;

      const text = candidateFromHandle(handle);
      if (!text) continue;

      const existing = byText.get(text);
      if (existing) {
        existing.platforms.add(platform);
      } else {
        byText.set(text, {
          text,
          platforms: new Set([platform]),
          order: NAME_PLATFORMS.indexOf(platform),
        });
      }
    }
  }

  if (byText.size === 0) {
    // Never blank and never an error: the raw handle is better than nothing.
    return { name: firstHandle ?? "", confidence: "LOW" };
  }

  const scored = [...byText.values()].map((candidate) => {
    const tokens = countTokens(candidate.text);
    const base = tokens >= 2 ? 3 : tokens === 1 ? 1 : 0;
    // Two platforms agreeing is the strongest signal available without a
    // network call.
    const corroborated = candidate.platforms.size >= 2 ? 1 : 0;
    return { ...candidate, score: base + corroborated };
  });

  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const best = scored[0]!;

  // 4 is two or more tokens corroborated across platforms, 3 is two or more
  // from a single platform. Everything below that is one token, however many
  // platforms agree on it -- "Jonahhodges" is no more a readable name for being
  // spelled the same way four times -- and a single token is exactly what the
  // preview's muted styling is for. The spec leaves 2 unbanded; it belongs with
  // the ones to glance at, not the ones to trust.
  const confidence: NameConfidence =
    best.score >= 4 ? "HIGH" : best.score === 3 ? "MEDIUM" : "LOW";

  return { name: best.text, confidence };
}

/* -------------------------------------------------------------------------- */
/* 2.4 + 2.7  Blocks and niches                                                */
/* -------------------------------------------------------------------------- */

const LIST_MARKER = /^\s*(\d+[.)]|[-*•])\s+/;
/** Google Docs tab headings, which are structure rather than a niche. */
const TAB_HEADING = /^#+\s*Tab\s*\d+\s*$/i;

function hasUrl(line: string): boolean {
  return /https?:\/\//i.test(line) || /(?<![/\w.])www\./i.test(line);
}

type Block = { text: string; niche: string };

/**
 * Splits the document into one block per lead, carrying the niche in force
 * where each block began.
 *
 * A blank line never ends a block: one lead in the fixture has its URLs either
 * side of one. A line of plain text does end a block, because that is what a
 * niche heading looks like and the file switches niche partway through.
 */
export function splitBlocks(cleaned: string): Block[] {
  const lines = cleaned.split("\n");
  const markerCount = lines.filter((line) => LIST_MARKER.test(line)).length;
  const listMode = markerCount >= 2;

  const blocks: Block[] = [];
  let current: string[] | null = null;
  let currentNiche = "";
  let niche = "";

  const flush = () => {
    if (current && current.length > 0) {
      const text = current.join("\n");
      if (hasUrl(text)) blocks.push({ text, niche: currentNiche });
    }
    current = null;
  };

  for (const line of lines) {
    const blank = line.trim() === "";

    if (listMode && LIST_MARKER.test(line)) {
      flush();
      current = [line.replace(LIST_MARKER, "")];
      currentNiche = niche;
      continue;
    }

    if (blank) {
      // Blank-line mode is the fallback for documents with no list at all.
      if (!listMode) flush();
      continue;
    }

    if (hasUrl(line)) {
      if (!current) {
        current = [];
        currentNiche = niche;
      }
      current.push(line.replace(LIST_MARKER, ""));
      continue;
    }

    // Plain text: a niche heading, or a tab heading to be ignored. Either way
    // the lead before it has ended.
    flush();
    if (!TAB_HEADING.test(line.trim())) {
      const text = line.replace(/^#+\s*/, "").trim();
      // Several in a row: the last one wins, which falls out of overwriting.
      if (text) niche = text;
    }
  }

  flush();
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* The whole thing                                                             */
/* -------------------------------------------------------------------------- */

export function parseLeads(raw: string): ParsedLead[] {
  const cleaned = preClean(raw);
  return splitBlocks(cleaned).map((block) => {
    const links = classifyBlockUrls(extractUrls(block.text));
    const { name, confidence } = guessName(links);
    return { name, confidence, company: "", niche: block.niche, links };
  });
}
