/**
 * Everything about a lead's links that is not storage: which platforms exist,
 * how a URL is classified, and how one is shortened for display.
 *
 * Deliberately free of any database import. The importer's parser, the one-time
 * backfill and the drawer all have to agree on these rules, and two of those
 * three run in the browser.
 */

/** Fixed display order. Rows in the drawer sort by this, then insertion order. */
export { LINK_PLATFORMS, type LinkPlatform } from "./db/enums";
import { LINK_PLATFORMS, type LinkPlatform } from "./db/enums";

export const LINK_PLATFORM_LABELS: Record<LinkPlatform, string> = {
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  facebook: "Facebook",
  website: "Website",
  other: "Other",
};

export type LeadLink = {
  id: string;
  platform: LinkPlatform;
  url: string;
  /** Only meaningful for "other"; defaults to the hostname. */
  label?: string | null;
};

/**
 * Booking pages, forms, communities and link-in-bio services. A URL on one of
 * these is something the prospect points at, not the site they own, so it never
 * becomes their "website".
 */
export const FUNNEL_HOSTS = [
  "calendly.com",
  "typeform.com",
  "skool.com",
  "whop.com",
  "linktr.ee",
  "beacons.ai",
  "mailchi.mp",
  "docs.google.com",
  "notion.site",
  "mykajabi.com",
  "kajabi.com",
  "gumroad.com",
  "stan.store",
  "go.hlpages",
  "ghl",
] as const;

export function isFunnelHost(host: string): boolean {
  const lower = host.toLowerCase();
  return FUNNEL_HOSTS.some((needle) => lower.includes(needle));
}

/** A pasted URL with no protocol is still a URL; a bare word is not. */
export function ensureProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** null rather than throwing: unparseable text is kept and shown as plain text. */
export function parseUrl(raw: string): URL | null {
  const candidate = ensureProtocol(raw);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    // "https://" alone parses but has no host, and neither does "https://?x".
    return url.hostname ? url : null;
  } catch {
    return null;
  }
}

/** The social platform a host names, or null when it names none of them. */
export function classifySocial(host: string): LinkPlatform | null {
  const h = host.toLowerCase();
  if (h.includes("instagram.com")) return "instagram";
  if (h.includes("x.com") || h.includes("twitter.com")) return "x";
  if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
  if (h.includes("linkedin.com")) return "linkedin";
  if (h.includes("tiktok.com")) return "tiktok";
  if (h.includes("facebook.com") || h.includes("fb.com")) return "facebook";
  return null;
}

/**
 * Classify a single URL on its own, with no knowledge of its siblings.
 *
 * Website-versus-other cannot be decided here: it depends on which unclassified
 * URL came first in the same block. Callers that have a block resolve that
 * afterwards; callers that do not (the drawer, the handle backfill) get
 * "website" for anything that is not a funnel host, which is the right answer
 * for a single URL.
 */
export function classifyUrl(raw: string): LinkPlatform {
  const url = parseUrl(raw);
  if (!url) return "other";
  return classifySocial(url.hostname) ?? (isFunnelHost(url.hostname) ? "other" : "website");
}

function stripWww(host: string): string {
  return host.replace(/^www\./i, "");
}

/** First path segment, with a leading @ removed. Empty string when there is none. */
function firstSegment(url: URL): string {
  const segment = url.pathname.split("/").filter(Boolean)[0] ?? "";
  return segment.replace(/^@/, "");
}

/**
 * A readable form of a link, never the raw URL when it can be helped.
 *
 * Dumb on purpose: anything it cannot parse comes back exactly as it went in,
 * because a shortener that mangles a URL is worse than one that does nothing.
 */
export function shortenLink(link: {
  platform: LinkPlatform;
  url: string;
  label?: string | null;
}): string {
  const url = parseUrl(link.url);
  if (!url) return link.url;

  switch (link.platform) {
    case "instagram":
    case "youtube":
    case "x":
    case "tiktok": {
      const handle = firstSegment(url);
      // A raw YouTube channel id is not a handle, so show the path instead of
      // pretending "@channel" means anything.
      if (!handle) return stripWww(url.hostname);
      if (handle === "channel" || handle === "c") {
        return url.pathname.replace(/\/$/, "");
      }
      return `@${handle}`;
    }
    case "linkedin": {
      const segments = url.pathname.split("/").filter(Boolean);
      const index = segments.indexOf("in");
      const handle = index >= 0 ? segments[index + 1] : segments[0];
      return handle ? `/in/${handle}` : stripWww(url.hostname);
    }
    case "facebook": {
      const handle = firstSegment(url);
      return handle ? `/${handle}` : stripWww(url.hostname);
    }
    default: {
      const path = url.pathname.replace(/\/$/, "");
      return `${stripWww(url.hostname)}${path}`;
    }
  }
}

/**
 * The comparable form of an Instagram URL, for spotting a lead already on the
 * board: lowercased, without protocol, www., query string or trailing slash.
 */
export function normalizeInstagramUrl(raw: string): string | null {
  const url = parseUrl(raw);
  if (!url) return null;
  if (classifySocial(url.hostname) !== "instagram") return null;
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  return `${stripWww(url.hostname).toLowerCase()}${path}`;
}

/** The first Instagram link, which is what the card shows. */
export function firstInstagram<T extends { platform: LinkPlatform }>(
  links: T[],
): T | null {
  return links.find((link) => link.platform === "instagram") ?? null;
}

const PLATFORM_ORDER = new Map(
  LINK_PLATFORMS.map((platform, index) => [platform, index] as const),
);

/** Fixed platform order; insertion order preserved within a platform. */
export function sortLinks<T extends { platform: LinkPlatform }>(links: T[]): T[] {
  return [...links]
    .map((link, index) => ({ link, index }))
    .sort(
      (a, b) =>
        (PLATFORM_ORDER.get(a.link.platform) ?? 99) -
          (PLATFORM_ORDER.get(b.link.platform) ?? 99) || a.index - b.index,
    )
    .map((row) => row.link);
}
