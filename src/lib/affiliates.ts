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

const PARTNERS: Record<AffiliatePartner, { name: string; hostname: string }> = {
  getyourguide: { name: "GetYourGuide", hostname: "www.getyourguide.com" },
};

function ticketPage(parkName: string, path: string): AffiliateParkLink {
  return { partner: "getyourguide", parkName, destination: `https://www.getyourguide.com/${path}/` };
}

/**
 * Keyed by canonical park id. Every open catalog park was checked against GetYourGuide's sitemaps;
 * a park is listed only if a ticket for that exact park is on sale, not merely a place page.
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
  4: ticketPage("Fuji-Q Highland", "fujiyoshida-l157144/fuji-q-highland-theme-park-entry-ticket-t1179359"),
  12: ticketPage("Kennywood", "west-mifflin-l204828/west-mifflin-pa-kennywood-park-admission-ticket-t685514"),
  14: ticketPage(
    "Luna Park Melbourne",
    "melbourne-l202/luna-park-melbourne-general-entry-with-unlimited-rides-t469257",
  ),
  16: ticketPage("Lake Compounce", "bristol-connecticut-l270721/bristol-ct-lake-compounce-admission-ticket-t687478"),
  22: ticketPage("Blackpool Pleasure Beach", "blackpool-l446/pleasure-beach-entry-ticket-t1028833"),
  40: ticketPage("Idlewild and Soak Zone", "ligonier-l207489/ligonier-pa-idlewild-admission-ticket-t687308"),
  77: ticketPage(
    "Busch Gardens Tampa Bay",
    "tampa-l1187/tampa-busch-gardens-tampa-bay-ticket-multi-park-options-t205881",
  ),
  89: ticketPage("Efteling", "kaatsheuvel-l156319/efteling-theme-park-resort-t71888"),
  92: ticketPage("Dreamworld", "gold-coast-l842/1-day-ticket-dreamworld-gold-coast-t528986"),
  103: ticketPage("Gardaland", "garda-l145126/gardaland-park-fixed-day-entry-ticket-t225588"),
  107: ticketPage(
    "California's Great America",
    "san-francisco-l61/san-francisco-california-s-great-america-admission-ticket-t1234401",
  ),
  111: ticketPage(
    "Chessington World of Adventures",
    "london-l57/chessington-world-of-adventures-resort-and-meal-deal-t112474",
  ),
  119: ticketPage("Parc Astérix", "paris-l16/paris-parc-asterix-1-day-ticket-t2901"),
  126: ticketPage("Everland", "yongin-si-l105118/seoul-everland-theme-park-entry-ticket-t1095866"),
  129: ticketPage(
    "Dutch Wonderland",
    "lancaster-pennsylvania-l32546/lancaster-pa-dutch-wonderland-admission-ticket-t684550",
  ),
  133: ticketPage("Mirabilandia", "savio-l191220/mirabilandia-amusement-park-1-day-entry-ticket-t455691"),
  136: ticketPage("Disneyland Park (Paris)", "paris-l16/disneyland-paris-full-day-entrance-ticket-t10734"),
  146: ticketPage("PortAventura Park", "salou-l1884/portaventura-theme-park-tickets-1-4-or-7-day-entry-t33471"),
  150: ticketPage("Movie Park Germany", "bottrop-l102774/bottrop-movie-park-skip-the-line-ticket-t429913"),
  157: ticketPage("SeaWorld San Antonio", "san-antonio-l892/san-antonio-seaworld-park-admission-ticket-t385727"),
  162: ticketPage("SeaWorld Orlando", "orlando-l191/seaworld-orlando-park-admission-ticket-t77944"),
  168: ticketPage("Sesame Place", "philadelphia-l60/philadelphia-official-sesame-place-entry-ticket-t413520"),
  171: ticketPage("Hopi Hari", "state-of-sao-paulo-l112627/tickets-for-hopi-hari-sao-paulo-theme-park-t924159"),
  173: ticketPage(
    "Six Flags Discovery Kingdom",
    "vallejo-l99171/san-francisco-six-flags-discovery-kingdom-admission-ticket-t1234226",
  ),
  178: ticketPage("Six Flags Mexico", "mexico-city-l194/six-flags-mexico-one-day-admission-ticket-t1503855"),
  182: ticketPage(
    "Suoi Tien Amusement Park",
    "ho-chi-minh-city-l272/ho-chi-minh-city-suoi-tien-theme-park-entry-train-ticket-t1482793",
  ),
  188: ticketPage(
    "Parque Warner Madrid",
    "madrid-l46/madrid-parque-warner-ticket-and-roundtrip-transportation-t477939",
  ),
  192: ticketPage("Lotte World", "seoul-l197/seoul-lotte-world-adventure-entry-ticket-t1129149"),
  196: ticketPage(
    "Tokyo Dome City Attractions",
    "suginami-city-l154480/tokyo-dome-city-attractions-pass-10-facility-ticket-qr-t1463491",
  ),
  199: ticketPage("Tivoli Gardens", "copenhagen-l12/copenhagen-tivoli-gardens-entry-ticket-t72048"),
  212: ticketPage("Disney Adventure World", "paris-l16/disneyland-paris-2-parks-ticket-1-2-3-4-5-day-t395320"),
  214: ticketPage("Universal Studios Japan", "osaka-l1204/osaka-universal-studios-japan-e-ticket-t129258"),
  222: ticketPage("Tibidabo Amusement Park", "barcelona-l45/tibidabo-amusement-park-entrance-ticket-t54571"),
  233: ticketPage("Universal Studios Singapore", "singapore-l170/universal-studios-singapore-entrance-ticket-t66117"),
  235: ticketPage("Belantis", "leipzig-l25/leipzig-belantis-theme-park-admission-ticket-t429606"),
  239: ticketPage("Ocean Park Hong Kong", "hong-kong-l174/hong-kong-ocean-park-entry-ticket-t690394"),
  242: ticketPage("OCT East", "shenzhen-l188/shenzhen-oct-east-theme-park-ticket-and-delivery-t118963"),
  244: ticketPage("Hong Kong Disneyland", "hong-kong-l174/hong-kong-disneyland-park-tickets-t194756"),
  247: ticketPage("SeaWorld San Diego", "san-diego-l263/san-diego-seaworld-park-admission-ticket-t406754"),
  252: ticketPage("Erlebnispark Tripsdrill", "cleebronn-l224755/tripsdrill-adventure-park-entry-ticket-t931867"),
  256: ticketPage("Nigloland", "dolancourt-l266337/dolancourt-entry-ticket-to-nigloland-t1136826"),
  258: ticketPage(
    "Chimelong Ocean Kingdom",
    "zhuhai-l113862/zhuhai-chimelong-ocean-kingdom-theme-park-ticket-t1415776",
  ),
  266: ticketPage("Energylandia", "krakow-l40/krakow-energylandia-full-day-ticket-with-optional-pickup-t114202"),
  267: ticketPage("Walibi Belgium", "wavre-l95237/walibi-belgium-entry-ticket-t396920"),
  272: ticketPage("Ferrari Land", "salou-l1884/portaventura-ferrari-land-tickets-1-2-or-3-day-entry-t115174"),
  288: ticketPage(
    "Chimelong Safari Park",
    "guangzhou-l184/guangzhou-chimelong-safari-tickets-optional-services-t1481865",
  ),
  294: ticketPage("Legoland California", "carlsbad-l514/legoland-california-resort-theme-park-1-day-admission-t398768"),
  295: ticketPage(
    "Legoland Deutschland",
    "gunzburg-l145871/gunzburg-legolandr-deutschland-resort-admission-ticket-t286270",
  ),
  297: ticketPage("Legoland Japan", "nagoya-l32669/legoland-japan-resort-sea-life-nagoya-combo-ticketz-t1457497"),
  300: ticketPage("Legoland Windsor", "windsor-l437/legoland-windsor-resort-entrance-ticket-t111115"),
  302: ticketPage("Beto Carrero World", "penha-l206944/penha-sc-beto-carrero-world-theme-park-1-day-ticket-t1413308"),
  313: ticketPage("Plopsaland Belgium", "de-panne-l182334/plopsaland-belgium-theme-park-entry-ticket-t431392"),
  314: ticketPage("Plopsaland Deutschland", "hassloch-l154783/hassloch-plopsaland-deutschland-entry-ticket-t416201"),
  335: ticketPage("Universal Studios Beijing", "beijing-l186/universal-studios-beijing-entry-ticket-t1490987"),
  336: ticketPage(
    "Universal Studios Hollywood",
    "los-angeles-l179/universal-studios-hollywood-general-admission-tickets-t45453",
  ),
  343: ticketPage("Shanghai Disney Resort", "shanghai-l178/shanghai-disneyland-park-entry-ticket-t1348954"),
  424: ticketPage(
    "Nickelodeon Universe American Dream",
    "new-york-city-l59/east-rutherford-nickelodeon-universe-theme-park-ticket-t400265",
  ),
  433: ticketPage(
    "Gumbuya World",
    "tynong-north-l207271/tynongmelbourne-gumbuya-world-theme-park-entry-ticket-t1065017",
  ),
  449: ticketPage("Tokyo Joypolis", "tokyo-l193/tokyo-odaiba-joypolis-ticket-exchange-required-t1474790"),
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
