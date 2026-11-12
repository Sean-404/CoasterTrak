import type { Coaster } from "@/types/domain";
import { isLocalWikiUpload } from "@/lib/commons-credit";
import { normalizeManufacturerLabel } from "@/lib/display";

const INCIDENT_IMAGE_TOKENS = new Set([
  "incident",
  "accident",
  "derailment",
  "collision",
  "crash",
  "explosion",
  "fatal",
  "fatality",
]);

function imageUrlTokens(url: string): string[] {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  return `${url} ${decoded}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Generic guard: suppress incident/disaster-style image URLs from Wikidata/Commons. */
export function isLikelyIncidentImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const tokens = imageUrlTokens(url);
  if (tokens.some((token) => INCIDENT_IMAGE_TOKENS.has(token))) return true;
  // "disaster" alone is a real ride name (Disaster Transport); only drop accident photos.
  return (
    tokens.includes("disaster") &&
    (tokens.includes("funfair") || tokens.includes("battersea") || tokens.includes("before"))
  );
}

/** Use when persisting or displaying `image_url` so known-bad Commons files never stick. */
export function sanitizeCoasterImageUrl(url: string | null | undefined): string | null {
  if (url == null || url === "") return null;
  if (isLikelyIncidentImageUrl(url)) return null;
  // Single-wiki uploads are usually fair-use files we have no licence to show.
  if (isLocalWikiUpload(url)) return null;
  return url;
}

/**
 * Correct catalog rows where enrichment lagged behind Wikipedia renames,
 * or a one-off bad stat slipped in. Prefer wikidata_id; use legacy names only when unambiguous.
 */
const COASTER_FIXES_BY_WIKIDATA_ID: Record<
  string,
  Partial<
    Pick<
      Coaster,
      | "name"
      | "inversions"
      | "coaster_type"
      | "status"
      | "manufacturer"
      | "image_url"
      | "height_ft"
      | "speed_mph"
      | "length_ft"
      | "duration_s"
      | "opening_year"
      | "closing_year"
    >
  >
> = {
  // Blackpool — rebranded from Zipper Dipper; park signage & enwiki use "Blue Flyer"
  // Speed / length: https://de.wikipedia.org/wiki/Blue_Flyer (40 km/h, 335 m)
  Q885702: { name: "Blue Flyer", status: "Operating", speed_mph: 25, length_ft: 1099 },
  // Wikidata items that lacked an English label (sync used to store the bare Q-id).
  Q132174212: { name: "ジェットコースター", status: "Defunct" },
  Q135790425: { name: "Cétautomatix", status: "Operating" },
  Q19765421: { name: "Alpenblitz", status: "Operating" },
  Q21008851: { name: "Tornado", status: "Operating" },
  Q2505886: { name: "Dragon Wagon", status: "Operating" },
  // Energylandia — Wikidata EN label is "Dragon"; park branding is RMF Dragon.
  // No enwiki sitelink; fuzzy match previously stole the Legoland series article.
  Q25412902: { name: "RMF Dragon", status: "Operating" },
  // Fantasy Island (UK) — formerly Jubilee Odyssey; keep current park/Wikidata name.
  Q1710760: { name: "The Odyssey", status: "Operating" },
  Q56697767: { name: "Coccinelle", status: "Operating" },
  // Camelot — Wikidata keeps Portopialand (2006) retirement on the same QID as 2007 UK reopen.
  Q13415786: { closing_year: 2012, status: "Defunct" },
  // Lost Island — prior Liseberg (Kanonen) retirement must not stick after 2023 reopen.
  Q134966734: { closing_year: null, status: "Operating" },
  // Alton Towers — Air closed for VR refurb (2015) and reopened as Galactica (still operating).
  Q406696: { closing_year: null, status: "Operating" },
  // Blackpool classic wood out-and-back; inversions must stay 0 (bad imports sometimes confuse with train count)
  Q265733: {
    inversions: 0,
    status: "Operating",
    coaster_type: "Wood",
    // Opened 23 Aug 1923: https://de.wikipedia.org/wiki/Big_Dipper_(Blackpool)
    opening_year: 1923,
    image_url:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Big%20Dipper%20(Pleasure%20Beach,%20Blackpool)%2002.jpg",
  },
  // DCA rethemes
  Q1026847: { name: "Incredicoaster", status: "Operating" },
  Q3327600: { name: "Goofy's Sky School", status: "Operating" },
  Q16665502: { name: "Goofy's Sky School", status: "Operating" },
  // Cedar Point rethemes
  Q1189847: { name: "Top Thrill 2", status: "Operating" },
  Q1476401: { name: "Rougarou", status: "Operating" },
  // Mantis ran 11 May 1996 – 19 Oct 2014, then reopened as Rougarou (Q1476401) in 2015.
  // https://en.wikipedia.org/wiki/Rougarou_(roller_coaster)
  Q112689934: { name: "Mantis", status: "Defunct", opening_year: 1996, closing_year: 2014 },
  Q1787446: { name: "Steel Vengeance", status: "Operating" },
  Q60845759: { name: "Mean Streak", status: "Defunct" },
  // Canada's Wonderland — ThemeParks feed used DareDeviler for The Fly
  Q2880135: { name: "The Fly", status: "Operating" },
  // Canada's Wonderland Thunder Run (not Kentucky Kingdom's wood coaster)
  Q7799028: {
    height_ft: 33,
    speed_mph: 40,
    length_ft: 1080,
    duration_s: 84,
    manufacturer: "Mack Rides",
    coaster_type: "Steel",
  },
  // Enchanted Kingdom — park / ThemeParks name
  Q7572494: { name: "Space Shuttle Max", status: "Operating" },
  // Animal Kingdom / Hollywood Studios
  Q1341067: {
    name: "Expedition Everest - Legend of the Forbidden Mountain",
    status: "Operating",
  },
  Q139394198: {
    name: "Rock 'n' Roller Coaster Starring The Muppets",
    status: "Operating",
  },
  // Europa-Park
  Q477897: { name: "Blue Fire", status: "Operating" },
  Q14475699: { name: "Arthur", status: "Operating" },
  Q443680: { name: "WODAN - Timburcoaster", status: "Operating" },
  Q63196746: { name: "Eurosat - CanCan Coaster", status: "Operating" },
  // Closed June 2023, rebuilt in place and reopened 2024; the infobox lists only the 2023
  // closing, so clear it. https://en.wikipedia.org/wiki/Alpenexpress_Enzian
  Q323953: { name: "Alpine Express 'Enzian'", status: "Operating", closing_year: null },
  Q121359119: { name: "Voltron Nevera powered by Rimac", status: "Operating" },
  // Phantasialand
  Q319747: { name: "Crazy Bats", status: "Operating" },
  Q1497026: { name: "Gebirgsbahn", status: "Defunct" },
  Q1542448: { name: "Grand-Canyon-Bahn", status: "Defunct" },
  // Six Flags Magic Mountain
  // Colossus ran 29 Jun 1978 – 16 Aug 2014, then reopened as Twisted Colossus (Q75099048)
  // in 2015; the row had inherited the 2015 opening. https://en.wikipedia.org/wiki/Twisted_Colossus
  Q677477: { name: "Colossus", status: "Defunct", opening_year: 1978, closing_year: 2014 },
  Q75099048: { name: "Twisted Colossus", status: "Operating" },
  Q618766: { name: "Apocalypse", status: "Operating" },
  Q674382: { name: "Scream", status: "Operating" },
  Q25223509: { name: "Wicker Man", status: "Operating", height_ft: 66 },
  // Alton Towers — Wikidata P18 still the pre-2024 retrack photo
  Q1477806: {
    name: "Nemesis Reborn",
    status: "Operating",
    image_url:
      "https://commons.wikimedia.org/wiki/Special:FilePath/Alton%20Towers%20-%20Nemesis%20Reborn%205-9-2025.jpg",
  },
  // Mid America Adventure (ex-Six Flags St. Louis) — Wikipedia titles carry the park name.
  // https://en.wikipedia.org/wiki/Ninja_(Mid_America_Adventure)
  Q1432350: { name: "Ninja", status: "Operating" },
  // https://en.wikipedia.org/wiki/Boomerang_(Mid_America_Adventure)
  Q7887822: { name: "Boomerang", status: "Operating" },
  // Dreamland Margate Scenic Railway — opened 3 Jul 1920; shut after a derailment in Aug 2024
  // and never reopened; Dreamland retired it on 27 Jan 2026.
  // https://en.wikipedia.org/wiki/Scenic_Railway_(Dreamland_Margate)
  // https://theisleofthanetnews.com/2026/01/28/dreamland-heritage-trust-sadness-at-dreamland-decision-to-retire-scenic-railway-despite-funding-based-on-ride-operation-until-2037/
  Q2229130: { name: "Scenic Railway", status: "Defunct", opening_year: 1920, closing_year: 2024 },
  // Magic Kingdom — Wikipedia multi-park manufacturer blob wrongly attached
  Q85474505: { manufacturer: "Arrow Development" },
  // Disneyland Space Mountain — current track work / rebuild attribution
  Q11704022: { manufacturer: "Dynamic Structures" },
  // Magic Kingdom TRON — WD has length only; type is launched subclass, no P176
  Q123594444: {
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Vekoma",
    height_ft: 78,
    speed_mph: 59,
    length_ft: 3169,
    inversions: 0,
    duration_s: 60,
  },
  // Alton Towers historical
  Q3338910: { name: "Beast", status: "Defunct" },
  // Gold Reef City — Wikidata sparse / wrong class labels; published park figures
  Q483513: {
    name: "Anaconda",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Vekoma",
    height_ft: 112,
    speed_mph: 56,
    length_ft: 2448,
    inversions: 5,
    duration_s: 100,
  },
  Q28649619: {
    name: "Golden Loop",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Schwarzkopf",
    height_ft: 138,
    speed_mph: 57,
    length_ft: 863,
    inversions: 1,
    duration_s: 30,
  },
  Q2446903: {
    name: "Tower of Terror",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Intamin",
    height_ft: 112,
    speed_mph: 59,
    inversions: 0,
    duration_s: 28,
  },
  // Universal Orlando — multi-install Wikidata rows that lag on stats / park linkage
  Q3073731: {
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Vekoma",
    height_ft: 43,
    speed_mph: 29,
    length_ft: 1099,
    inversions: 0,
    duration_s: 66,
  },
  // Universal Studios Singapore Revenge of the Mummy (not Florida — that is Q2146774)
  Q21051432: {
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Premier Rides",
    height_ft: 44,
    speed_mph: 40,
    length_ft: 2200,
    inversions: 0,
    duration_s: 180,
  },
  // Tokyo Joypolis — Wikidata has only a German label and no park/coords
  Q106941958: {
    name: "Gekion Live Coaster",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Gerstlauer",
    height_ft: 16,
    speed_mph: 24,
    length_ft: 984,
    inversions: 1,
  },
  // Six Flags America — Firebird (ex-Iron Wolf). Park closed Nov 2025; coords lag at SFGAm.
  Q618765: {
    name: "Firebird",
    status: "Defunct",
    closing_year: 2025,
    coaster_type: "Steel",
    manufacturer: "Bolliger & Mabillard",
  },
  // Relocated Wikidata rows that kept prior-life Defunct after closing_year clear
  Q7537977: { status: "Operating", closing_year: null }, // Freestyle @ Canada's Wonderland
  Q17361975: { status: "Operating", closing_year: null }, // Goliath @ Six Flags New England
  Q21593102: { name: "The Joker", status: "Operating", closing_year: null }, // Discovery Kingdom
  Q2183558: { name: "Garuda Glide", status: "Operating", closing_year: null }, // Kentucky Kingdom
  // Six Flags America — park closed 2 Nov 2025; Wikidata coords are the Maryland install.
  // Darien Lake's mirrored Ride of Steel is a separate catalog row (no shared Q-id).
  Q839200: { status: "Defunct" },
  // Kings Dominion — Geauga Lake retirement must not mark the 2008 relocate Defunct.
  Q951359: { status: "Operating", closing_year: null },
  // Parque de la Ciudad (Buenos Aires) — Intamin racing coaster, never opened (SBNO)
  Q2518728: {
    status: "Defunct",
    coaster_type: "Steel",
    manufacturer: "Intamin",
    inversions: 0,
  },
  // Plopsaland Ardennes (formerly Plopsa Coo) — Wikidata has only a Dutch label
  Q122460556: { name: "Wickie The Ride" },
  // Fårup Sommarland — Wikidata swapped height/length (63 ft tall, 1486 ft long)
  Q106372161: { height_ft: 63, length_ft: 1486 },
  // Fårup Sommarland — Wikidata swapped height/length (20 m / 540 m). Still listed by the park.
  // https://www.faarupsommerland.dk/forlystelser
  Q12325227: { height_ft: 66, length_ft: 1772, speed_mph: 50, status: "Operating" },
  // Six Flags Qiddiya — official 160 m (Wikidata slightly high at 163 m)
  Q131686270: { height_ft: 525 },
  // Coney Island historical — Wikidata conflated bad height (60 ft peak)
  Q7370852: { height_ft: 60 },
  // The STRAT — Wikidata uses tower elevation (264 m); ride structure is ~68 ft
  Q8041524: { height_ft: 68 },

  // --- Catalog missing-data queue (Oct 2026). Metric sources converted to ft / mph. ---
  // Fårup Sommerland Saven — Vekoma Family Boomerang, opened 5 Jun 2020: 24 m, 238 m, 60 km/h.
  // https://vekoma.com/news/congratulations-to-farup-sommerland-with-the-opening-of-saven
  // https://www.faarupsommerland.dk/forlystelser
  Q131466702: {
    status: "Operating",
    manufacturer: "Vekoma",
    opening_year: 2020,
    height_ft: 79,
    length_ft: 781,
    speed_mph: 37,
  },
  // Hansa-Park — both still listed by the park (https://www.hansapark.de/attraktionen/).
  // https://de.wikipedia.org/wiki/Die_Schlange_von_Midgard — Gerstlauer 2011, ca. 10 m, 200 m, 45 km/h
  Q2238321: {
    status: "Operating",
    manufacturer: "Gerstlauer",
    opening_year: 2011,
    height_ft: 33,
    length_ft: 656,
    speed_mph: 28,
  },
  // https://de.wikipedia.org/wiki/Nessie_(Hansa-Park) — Schwarzkopf 1980, 26 m, 741 m, 79 km/h
  Q1978391: {
    status: "Operating",
    manufacturer: "Schwarzkopf",
    opening_year: 1980,
    height_ft: 85,
    length_ft: 2431,
    speed_mph: 49,
  },
  // https://en.wikipedia.org/wiki/Bulldog_Coaster_(Brean_Leisure_Park) — status open
  Q7499849: { status: "Operating" },
  // La Ronde Boomerang — Vekoma, 1984. Standard model: 35.5 m, 285 m, 75.6 km/h.
  // https://en.wikipedia.org/wiki/La_Ronde_(amusement_park)
  // https://fr.wikipedia.org/wiki/Boomerang_(parcs_Six_Flags)
  Q3220536: { status: "Operating", opening_year: 1984, height_ft: 116, length_ft: 935, speed_mph: 47 },
  // La Ronde Toboggan Nordique — Zamperla wild mouse, 2003.
  // https://en.wikipedia.org/wiki/La_Ronde_(amusement_park)
  Q27925522: { status: "Operating", opening_year: 2003 },
  // https://en.wikipedia.org/wiki/Goliath_(La_Ronde) — opened 13 May 2006
  Q688778: { status: "Operating", opening_year: 2006 },
  // Darien Lake Mind Eraser — Vekoma SLC, 1997, 110 ft; reopened 2025 after a 2024 refit.
  // https://en.wikipedia.org/wiki/Six_Flags_Darien_Lake
  // Standard 689 m / 80 km/h layout: https://fr.wikipedia.org/wiki/The_Mind_Eraser
  Q3521876: { status: "Operating", opening_year: 1997, height_ft: 110, length_ft: 2260, speed_mph: 50 },
  // https://en.wikipedia.org/wiki/Sesame_Place_Philadelphia — Gravity Group, 2018
  Q59587152: { status: "Operating", opening_year: 2018 },
  // https://en.wikipedia.org/wiki/Dorney_Park_%26_Wildwater_Kingdom — Zamperla, 2000
  Q8033427: { status: "Operating", opening_year: 2000 },
  // https://en.wikipedia.org/wiki/Nickelodeon_Universe — Intamin Surfrider, 2008
  Q4827808: { status: "Operating" },
  // https://en.wikipedia.org/wiki/Zach%27s_Zoomer — status Open
  Q3574493: { status: "Operating" },
  // https://en.wikipedia.org/wiki/Valleyfair — Arrow, 1980
  Q570734: { status: "Operating", opening_year: 1980 },
  // Renamed from Spacely's Sprocket Rockets. https://en.wikipedia.org/wiki/Six_Flags_Great_America
  Q3036455: { name: "Sprocket Rockets", status: "Operating" },
  // https://en.wikipedia.org/wiki/Wandering_Oaken%27s_Sliding_Sleighs
  Q124377115: { status: "Operating" },
  // Single-install de/fr Wikipedia infoboxes (metric converted) for gaps the enwiki fill cannot reach.
  // Bat Coaster @ Nigloland
  // https://fr.wikipedia.org/wiki/Bat_Coaster
  Q2887750: { height_ft: 66, speed_mph: 38, length_ft: 1148, manufacturer: "Pinfari", opening_year: 2002 },
  // Flounder's Flying Fish Coaster @ Tokyo DisneySea
  // https://fr.wikipedia.org/wiki/Flounder's_Flying_Fish_Coaster
  Q2358448: { speed_mph: 20, length_ft: 679, manufacturer: "Togo" },
  // Aftershock @ Silverwood Theme Park
  // https://fr.wikipedia.org/wiki/Aftershock_(Silverwood_Theme_Park)
  Q15139137: { height_ft: 192, speed_mph: 66, length_ft: 1204, manufacturer: "Vekoma", opening_year: 2008 },
  // Anubis: The Ride @ Plopsaland Belgium
  // https://fr.wikipedia.org/wiki/Anubis_The_Ride
  Q612257: { height_ft: 112, speed_mph: 56, length_ft: 1969, manufacturer: "Gerstlauer", opening_year: 2009 },
  // Big Loop @ Heide Park
  // https://fr.wikipedia.org/wiki/Big_Loop
  Q859001: { height_ft: 98, speed_mph: 39, length_ft: 2316, manufacturer: "Vekoma", opening_year: 1983 },
  // Coaster Express @ Parque Warner Madrid
  // https://de.wikipedia.org/wiki/Coaster-Express
  Q1104428: {
    height_ft: 121,
    speed_mph: 50,
    length_ft: 4573,
    manufacturer: "Roller Coaster Corporation of America",
    opening_year: 2002,
  },
  // Comet @ Walygator Parc
  // https://fr.wikipedia.org/wiki/Comet_(Walygator_Grand_Est)
  Q3565964: { height_ft: 79, speed_mph: 40, length_ft: 1936, manufacturer: "Vekoma", opening_year: 1989 },
  // Desert Race @ Heide Park
  // https://fr.wikipedia.org/wiki/Desert_Race
  Q833115: { height_ft: 62, speed_mph: 62, length_ft: 2133, manufacturer: "Intamin", opening_year: 2007 },
  // Die heiße Fahrt @ Wild- und Freizeitpark Klotten
  // https://de.wikipedia.org/wiki/Die_heiße_Fahrt
  Q1218623: { height_ft: 57, speed_mph: 34, length_ft: 1745, manufacturer: "Gerstlauer", opening_year: 2004 },
  // Draak @ Plopsaland Belgium — renamed Draconis for 2025 (https://en.wikipedia.org/wiki/Plopsaland_Belgium)
  // https://fr.wikipedia.org/wiki/Draconis
  Q2197328: {
    name: "Draconis",
    height_ft: 46,
    speed_mph: 22,
    length_ft: 1476,
    manufacturer: "Mack Rides",
    opening_year: 2004,
  },
  // El Diablo @ PortAventura Park
  // https://fr.wikipedia.org/wiki/El_Diablo_-_Tren_de_la_Mina
  Q387867: {
    height_ft: 54,
    speed_mph: 37,
    length_ft: 3306,
    manufacturer: "Arrow Dynamics",
    opening_year: 1995,
  },
  // Extreme Rusher @ Happy Valley Beijing
  // https://fr.wikipedia.org/wiki/Extreme_Rusher
  Q1385492: {
    height_ft: 171,
    speed_mph: 83,
    length_ft: 2789,
    manufacturer: "S&S Worldwide",
    opening_year: 2011,
  },
  // Fjord Explorer @ Le Pal
  // https://fr.wikipedia.org/wiki/Fjord_Explorer
  Q125684938: {
    height_ft: 92,
    speed_mph: 49,
    length_ft: 1969,
    manufacturer: "Mack Rides",
    opening_year: 2024,
  },
  // K3 Roller Skater @ Plopsaland Belgium
  // https://fr.wikipedia.org/wiki/K3_Roller_Skater
  Q15077669: { height_ft: 43, speed_mph: 29, length_ft: 1099, manufacturer: "Vekoma", opening_year: 1991 },
  // Stunt Fall @ Parque Warner Madrid
  // https://fr.wikipedia.org/wiki/Stunt_Fall
  Q955517: { height_ft: 192, speed_mph: 66, length_ft: 1204, manufacturer: "Vekoma", opening_year: 2002 },
  // Super Wirbel @ Plopsaland Deutschland
  // https://de.wikipedia.org/wiki/Superwirbel
  Q2368124: { height_ft: 75, speed_mph: 40, length_ft: 2398, manufacturer: "Vekoma", opening_year: 1979 },
  // Thunderlooper @ Alton Towers
  // https://fr.wikipedia.org/wiki/Thunderlooper
  Q15077974: {
    height_ft: 138,
    speed_mph: 53,
    length_ft: 722,
    manufacturer: "Schwarzkopf",
    opening_year: 1990,
  },
  // Timberline Twister @ Knott's Berry Farm
  // https://fr.wikipedia.org/wiki/Timberline_Twister
  Q3528737: { height_ft: 30, length_ft: 480, manufacturer: "Bradley and Kaye", opening_year: 1983 },
  // Tomahawk @ PortAventura Park
  // https://fr.wikipedia.org/wiki/Tomahawk_(PortAventura_Park)
  Q2299311: {
    height_ft: 44,
    speed_mph: 30,
    length_ft: 1444,
    manufacturer: "Custom Coasters International",
    opening_year: 1997,
  },
  // Air Grover @ Busch Gardens Tampa Bay
  // https://fr.wikipedia.org/wiki/Air_Grover
  Q4698003: { opening_year: 2010 },
  // Huracan @ Bellewaerde
  // https://fr.wikipedia.org/wiki/Huracan_(Bellewaerde)
  Q3947495: { height_ft: 49, speed_mph: 31, length_ft: 1640, opening_year: 2013 },
  // Iron Claw @ Movie Park Germany
  // https://fr.wikipedia.org/wiki/MP_Xpress
  Q2438163: { height_ft: 109, speed_mph: 50, length_ft: 2260, opening_year: 2001 },
  // Runaway Mountain @ Six Flags Over Texas
  // https://fr.wikipedia.org/wiki/Runaway_Mountain_(Six_Flags_Over_Texas)
  Q3453218: { height_ft: 65, speed_mph: 40, length_ft: 1500, opening_year: 1996 },
  // Spatiale Expérience @ Nigloland
  // https://fr.wikipedia.org/wiki/Spatiale_Experience
  Q3492773: { height_ft: 66, speed_mph: 37, length_ft: 2625, opening_year: 1998 },
  // Wile E. Coyote's Grand Canyon Blaster @ Six Flags Over Texas
  // https://fr.wikipedia.org/wiki/Wile_E._Coyote's_Grand_Canyon_Blaster
  Q2201269: { height_ft: 16, opening_year: 2001 },
  // Abismo @ Parque de Atracciones de Madrid
  // https://de.wikipedia.org/wiki/Abismo
  Q321477: { height_ft: 152, speed_mph: 65, length_ft: 1476 },
  // Batman Gotham City Escape @ Parque Warner Madrid
  // https://de.wikipedia.org/wiki/Batman_Gotham_City_Escape
  Q120186859: { height_ft: 148, speed_mph: 64, length_ft: 3314 },
  // Journey to Atlantis @ SeaWorld San Diego
  // https://de.wikipedia.org/wiki/Journey_to_Atlantis_(SeaWorld_San_Diego)
  Q917240: { speed_mph: 42 },
  // Tornado @ Särkänniemi
  // https://fr.wikipedia.org/wiki/Tornado_(Särkänniemi)
  Q826726: { height_ft: 82, manufacturer: "Intamin", opening_year: 2001 },
  // Fridolin’s verrückter Zauberexpress @ Erlebnispark Straßwalchen
  // https://de.wikipedia.org/wiki/Fridolin%E2%80%99s_verrückter_Zauberexpress
  Q136436355: { speed_mph: 31, opening_year: 2021 },
  // Helios @ Erlebnispark Straßwalchen
  // https://de.wikipedia.org/wiki/Helios_(Achterbahn)
  Q133864138: { speed_mph: 47 },
  // Big Grizzly Mountain Runaway Mine Cars @ Hong Kong Disneyland
  // https://de.wikipedia.org/wiki/Big_Grizzly_Mountain_Runaway_Mine_Cars
  Q549739: { opening_year: 2012 },
  // Lightning Rod @ Dollywood
  // https://fr.wikipedia.org/wiki/Lightning_Rod
  Q22073205: { height_ft: 207 },
  // Lightning Run @ Kentucky Kingdom
  // https://de.wikipedia.org/wiki/Lightning_Run
  Q18153602: { height_ft: 100 },
  // Piraten @ Djurs Sommerland
  // https://fr.wikipedia.org/wiki/Piraten_(Djurs_Sommerland)
  Q603039: { speed_mph: 56 },
  // Raging Spirits @ Tokyo DisneySea
  // https://fr.wikipedia.org/wiki/Raging_Spirits
  Q267353: { height_ft: 52 },
  // Uncharted: The Enigma of Penitence @ PortAventura Park
  // https://fr.wikipedia.org/wiki/Uncharted_(PortAventura_Park)
  Q123892097: { speed_mph: 43 },
  // Coney Island Cyclone @ Luna Park, Coney Island
  // https://fr.wikipedia.org/wiki/Cyclone_(Coney_Island)
  Q677558: { manufacturer: "Harry C. Baker" },
  // Psyké Underground @ Walibi Belgium
  // https://fr.wikipedia.org/wiki/Turbine_(Walibi_Belgium)
  Q2327576: { opening_year: 1982 },
  // Roller Coaster @ Great Yarmouth Pleasure Beach
  // https://de.wikipedia.org/wiki/Roller_Coaster_(Great_Yarmouth_Pleasure_Beach)
  Q667635: { manufacturer: "Erich Heidrich", opening_year: 1932 },
  // Sky Wheel @ Skyline Park
  // https://fr.wikipedia.org/wiki/Sky_Wheel
  Q667521: { length_ft: 492 },
  // Ukko @ Linnanmäki
  // https://fr.wikipedia.org/wiki/Ukko_(Linnanmäki)
  Q3547878: { length_ft: 492 },
  // Grand National @ Blackpool Pleasure Beach
  // https://de.wikipedia.org/wiki/Grand_National_(Pleasure_Beach_Resort)
  Q1542634: { manufacturer: "Charles Paige" },
  // Nickelodeon Streak @ Blackpool Pleasure Beach
  // https://de.wikipedia.org/wiki/Nickelodeon_Streak
  Q1985681: { manufacturer: "Charles Paige" },
  // Desperado @ Primm Valley Resorts
  // https://de.wikipedia.org/wiki/Desperado_(Buffalo_Bill%E2%80%99s_Resort_&_Casino)
  Q1200848: { opening_year: 1994 },
  // Hollywood Dream – The Ride @ Universal Studios Japan
  // https://de.wikipedia.org/wiki/Hollywood_Dream:_The_Ride
  Q822344: { opening_year: 2007 },
  // Kawasemi @ Tobu Zoo
  // https://fr.wikipedia.org/wiki/Kawasemi
  Q1267346: { opening_year: 2008 },
  // Kumba @ Busch Gardens Tampa Bay
  // https://de.wikipedia.org/wiki/Kumba_(Busch_Gardens_Tampa)
  Q679029: { opening_year: 1993 },
  // Loup Garou @ Walibi Belgium
  // https://fr.wikipedia.org/wiki/Loup_Garou_(Walibi_Belgium)
  Q261806: { opening_year: 2001 },
  // Matterhorn-Blitz @ Europa-Park
  // https://fr.wikipedia.org/wiki/Matterhorn-Blitz
  Q319724: { opening_year: 1999 },
  // Minifigure Speedway @ Legoland Windsor
  // https://de.wikipedia.org/wiki/Minifigure_Speedway
  Q130735411: { opening_year: 2024 },
  // Superman: La Atracción de Acero @ Parque Warner Madrid
  // https://de.wikipedia.org/wiki/Superman:_La_Atracción_de_Acero
  Q667624: { opening_year: 2002 },
  // Yukon Quad @ Le Pal
  // https://fr.wikipedia.org/wiki/Yukon_Quad
  Q98016144: { opening_year: 2018 },
};

/**
 * Never-built / cancelled concepts that must not appear in the live catalog
 * (and must not be re-imported from Wikidata sync/upload).
 * e.g. Skyscraper Polercoaster for Skyplex on I-Drive — not Epic Universe.
 * @see https://en.wikipedia.org/wiki/Skyscraper_(roller_coaster)
 */
const SKIP_WIKIDATA_COASTER_IDS = new Set<string>([
  // Second Wikidata items for rides merged in 20261104120000_merge_same_ride_duplicates.sql;
  // skipped so a sync cannot recreate the duplicate row.
  "Q874877", // Eurosat (kept: Eurosat - CanCan Coaster)
  "Q16899487", // Runaway Train (kept: Scorpion Express)
  "Q859406", // Big Thunder Mountain Railroad at Disneyland Paris
  "Q7508555", // Sidewinder at Hersheypark (kept: Jolly Rancher Remix)
  "Q141069235", // Gotham City Escape at Parque Warner Madrid
  "Q18378567",
  // Battersea Park funfair disaster (1972) — event article, not a catalog ride
  "Q22000267",
  // Woody Woodpecker's Nuthouse Coaster was rethemed in place as Trolls Trollercoaster (2024):
  // same track and credit, so list it once under the current name.
  // https://wdwnt.com/2023/11/dreamworks-land-making-progress-at-universal-studios-florida-with-more-painting-at-the-trollercoaster
  "Q3569870",
]);

/** Every skipped Wikidata id, sorted (exported to coastertrak-data by catalog-hidden-rules.ts). */
export function skippedWikidataCoasterIds(): string[] {
  return [...SKIP_WIKIDATA_COASTER_IDS].sort();
}

export function shouldSkipWikidataCoasterId(wikidataId: string | null | undefined): boolean {
  const q = wikidataId?.trim().toUpperCase();
  return Boolean(q && SKIP_WIKIDATA_COASTER_IDS.has(q));
}

/** Name-keyed fixes when Wikidata id is missing (new parks / QT leftovers). */
const COASTER_FIXES_BY_NAME_KEY: Record<
  string,
  Partial<
    Pick<
      Coaster,
      | "name"
      | "inversions"
      | "coaster_type"
      | "status"
      | "manufacturer"
      | "height_ft"
      | "speed_mph"
      | "length_ft"
      | "duration_s"
    >
  >
> = {
  // Retheme of Woody Woodpecker's Nuthouse Coaster (Vekoma junior, 1999) on the same track.
  trollstrollercoaster: {
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Vekoma",
    height_ft: 28,
    speed_mph: 22,
  },
  // Alton Towers install closed 1996; hardware later ran as Katapul (Hopi Hari).
  thunderlooper: { name: "Thunderlooper", status: "Defunct" },
  // Epic Universe — RCDB / Universal published figures (height/length often still unpublished)
  curseofthewerewolf: {
    name: "Curse of the Werewolf",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Mack Rides",
    speed_mph: 37,
    inversions: 0,
    duration_s: 130,
  },
  hiccupswinggliders: {
    name: "Hiccup's Wing Gliders",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Intamin",
    speed_mph: 45,
    inversions: 0,
  },
  hiccupwingglider: {
    name: "Hiccup's Wing Gliders",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Intamin",
    speed_mph: 45,
    inversions: 0,
  },
  minecartmadness: {
    name: "Mine-Cart Madness",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Setpoint",
    inversions: 0,
    duration_s: 180,
  },
  // ThemeParks leftover misnamed "Bowser Jr. Challenge" — Universal / enwiki title.
  bowserjrchallenge: {
    name: "Mario Kart: Bowser's Challenge",
    status: "Operating",
    manufacturer: "Dynamic Attractions",
    duration_s: 300,
  },
  bowserschallenge: {
    name: "Mario Kart: Bowser's Challenge",
    status: "Operating",
    manufacturer: "Dynamic Attractions",
    duration_s: 300,
  },
  californiascreamin: {
    name: "Incredicoaster",
    coaster_type: "Steel",
    status: "Operating",
  },
  zipperdipper: {
    name: "Blue Flyer",
    status: "Operating",
  },
  topthrilldragster: {
    name: "Top Thrill 2",
    status: "Operating",
  },
  mulhollandmadness: {
    name: "Goofy's Sky School",
    status: "Operating",
  },
  daredeviler: {
    name: "The Fly",
    status: "Operating",
  },
  // Plopsaland Belgium — official attraction page (metric → catalog imperial)
  // https://www.plopsa.com/en/plopsaland-belgium/attractions/likeme-coaster
  likemecoaster: {
    name: "#LikeMe Coaster",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Zierer",
    height_ft: 26,
    speed_mph: 22,
    length_ft: 1181,
    duration_s: 80,
    inversions: 0,
  },
  // Pigeon Forge — Wikidata conflated track length (3937 ft) with height
  smokymountainalpinecoaster: {
    name: "Smoky Mountain Alpine Coaster",
    coaster_type: "Steel",
    status: "Operating",
    manufacturer: "Wiegand",
    height_ft: 363,
    speed_mph: 27,
    length_ft: 3937,
    inversions: 0,
  },
};

function coasterNameFixKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function applyCoasterKnownFixes<
  T extends Pick<Coaster, "name"> &
    Partial<
      Pick<
        Coaster,
        | "wikidata_id"
        | "inversions"
        | "coaster_type"
        | "status"
        | "manufacturer"
        | "image_url"
        | "height_ft"
        | "speed_mph"
        | "length_ft"
        | "duration_s"
        | "opening_year"
        | "closing_year"
      >
    >,
>(
  c: T,
): T {
  let out: T = c;
  const q = c.wikidata_id?.trim().toUpperCase();
  if (q) {
    const byWd = COASTER_FIXES_BY_WIKIDATA_ID[q];
    if (byWd) out = { ...out, ...byWd };
  }
  const byName = COASTER_FIXES_BY_NAME_KEY[coasterNameFixKey(out.name)];
  if (byName) {
    // Fill blanks / correct type; don't overwrite richer DB values with nulls.
    out = {
      ...out,
      ...Object.fromEntries(
        Object.entries(byName).filter(([key, value]) => {
          if (value == null) return false;
          if (key === "name" || key === "coaster_type" || key === "status" || key === "manufacturer") {
            return true;
          }
          const current = out[key as keyof T];
          return current == null;
        }),
      ),
    } as T;
  }
  const cleaned = sanitizeCoasterImageUrl(out.image_url ?? null);
  if (cleaned !== out.image_url) {
    out = { ...out, image_url: cleaned };
  }
  const manufacturer = normalizeManufacturerLabel(out.manufacturer ?? null);
  if (manufacturer !== (out.manufacturer ?? null)) {
    out = { ...out, manufacturer };
  }
  return out;
}
