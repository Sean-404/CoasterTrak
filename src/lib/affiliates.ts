export type AffiliatePartner = "getyourguide";

export type AffiliateParkLink = {
  partner: AffiliatePartner;
  /** Catalog name, so the map stays reviewable next to the live park list. */
  parkName: string;
  destination: string;
};

export type AffiliateEnv = {
  enabled: boolean;
  getYourGuidePartnerId?: string;
};

export type ResolvedAffiliateLink = {
  href: string;
  partnerName: string;
};

/** Shown beside the links. Wording agreed for UK ASA and US FTC; do not move it behind a tooltip. */
export const AFFILIATE_DISCLOSURE = "Ad: we may earn commission if you book, at no extra cost to you.";

/** Marks a park whose destination could not be confirmed. These entries render nothing. */
export const PLACEHOLDER_DESTINATION = "PLACEHOLDER_CONFIRM_URL";

export const AFFILIATE_MAX_PARKS = 20;

const PARTNERS: Record<AffiliatePartner, { name: string; hostname: string }> = {
  getyourguide: { name: "GetYourGuide", hostname: "www.getyourguide.com" },
};

/**
 * Keyed by canonical park id: the seven Orlando parks, then the top non-Orlando parks by
 * `parkSitemapScore` (Six Flags AstroWorld is skipped: closed, but not flagged defunct in the catalog).
 * Destinations carry no tracking; `resolveAffiliateLink` adds it from env.
 * A placeholder means GetYourGuide showed no bookable ticket for that park when last checked.
 */
export const AFFILIATE_PARK_LINKS: Readonly<Record<number, AffiliateParkLink>> = {
  151: {
    partner: "getyourguide",
    parkName: "Disney's Magic Kingdom",
    destination: "https://www.getyourguide.com/magic-kingdom-park-l3851/",
  },
  284: {
    partner: "getyourguide",
    parkName: "Epcot",
    destination: "https://www.getyourguide.com/epcot-theme-park-l3850/",
  },
  273: {
    partner: "getyourguide",
    parkName: "Disney's Hollywood Studios",
    destination: "https://www.getyourguide.com/disney-s-hollywood-studios-l3855/",
  },
  191: {
    partner: "getyourguide",
    parkName: "Disney's Animal Kingdom",
    destination: "https://www.getyourguide.com/disney-s-animal-kingdom-l3857/",
  },
  177: {
    partner: "getyourguide",
    parkName: "Universal Studios Florida",
    destination: "https://www.getyourguide.com/universal-studios-florida-l181174/",
  },
  169: {
    partner: "getyourguide",
    parkName: "Universal's Islands of Adventure",
    destination: "https://www.getyourguide.com/universal-s-islands-of-adventure-l3853/",
  },
  332: {
    partner: "getyourguide",
    parkName: "Epic Universe",
    destination: "https://www.getyourguide.com/universal-epic-universe-l219556/",
  },
  70: { partner: "getyourguide", parkName: "Six Flags Great Adventure", destination: PLACEHOLDER_DESTINATION },
  64: { partner: "getyourguide", parkName: "Six Flags Magic Mountain", destination: PLACEHOLDER_DESTINATION },
  2: { partner: "getyourguide", parkName: "Cedar Point", destination: PLACEHOLDER_DESTINATION },
  115: { partner: "getyourguide", parkName: "Six Flags Great America", destination: PLACEHOLDER_DESTINATION },
  67: { partner: "getyourguide", parkName: "Kings Island", destination: PLACEHOLDER_DESTINATION },
  1: {
    partner: "getyourguide",
    parkName: "Alton Towers",
    destination: "https://www.getyourguide.com/alton-towers-l36405/",
  },
  23: { partner: "getyourguide", parkName: "Hersheypark", destination: PLACEHOLDER_DESTINATION },
  72: { partner: "getyourguide", parkName: "Kings Dominion", destination: PLACEHOLDER_DESTINATION },
  3: {
    partner: "getyourguide",
    parkName: "Europa-Park",
    destination: "https://www.getyourguide.com/europa-park-l35327/",
  },
  132: { partner: "getyourguide", parkName: "Six Flags Fiesta Texas", destination: PLACEHOLDER_DESTINATION },
  73: {
    partner: "getyourguide",
    parkName: "Busch Gardens Williamsburg",
    destination:
      "https://www.getyourguide.com/williamsburg-virginia-l3480/williamsburg-busch-gardens-ticket-water-country-option-t43843/",
  },
  68: { partner: "getyourguide", parkName: "Carowinds", destination: PLACEHOLDER_DESTINATION },
  43: { partner: "getyourguide", parkName: "Six Flags New England", destination: PLACEHOLDER_DESTINATION },
};

/** Whole `process.env.NEXT_PUBLIC_*` reads: Next.js only inlines these spelled out in full. */
export function readAffiliateEnv(): AffiliateEnv {
  return {
    enabled: process.env.NEXT_PUBLIC_AFFILIATES_ENABLED === "true",
    getYourGuidePartnerId: process.env.NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID,
  };
}

function confirmedDestination(link: AffiliateParkLink): URL | null {
  if (link.destination === PLACEHOLDER_DESTINATION || !URL.canParse(link.destination)) return null;
  const url = new URL(link.destination);
  if (url.protocol !== "https:" || url.hostname !== PARTNERS[link.partner].hostname) return null;
  return url;
}

/** The park's tracked link, or null whenever the box must not appear. */
export function resolveAffiliateLink(
  parkId: number,
  parkIsDefunct: boolean,
  env: AffiliateEnv = readAffiliateEnv(),
): ResolvedAffiliateLink | null {
  if (!env.enabled || parkIsDefunct) return null;

  const link = AFFILIATE_PARK_LINKS[parkId];
  if (!link) return null;

  const destination = confirmedDestination(link);
  const partnerId = env.getYourGuidePartnerId?.trim();
  if (!destination || !partnerId) return null;

  destination.searchParams.set("partner_id", partnerId);
  return { href: destination.href, partnerName: PARTNERS[link.partner].name };
}
