import type { Coaster } from "@/types/domain";
import { effectiveClosingYear } from "@/lib/coaster-status";

/**
 * Corrections that depend on the park a row is attached to. Wikidata and Wikipedia
 * describe a ride's current home, so a former installation (or every ride at a park that
 * has since closed) can inherit "Operating" from the ride's later life elsewhere.
 * Each entry cites the source it was checked against.
 */

/** Parks that have closed for good: every catalog coaster there is defunct. */
export const CLOSED_PARKS: Record<string, { closedYear: number; source: string }> = {
  // Six Flags announced the closure in May 2025; final operating day 2 Nov 2025.
  "Six Flags America": {
    closedYear: 2025,
    source: "https://www.foxla.com/news/six-flags-america-closes-after-50-years",
  },
  // Cleveland lakeside park; closed for good on 28 Sep 1969.
  "Euclid Beach Park": {
    closedYear: 1969,
    source: "https://en.wikipedia.org/wiki/Euclid_Beach_Park",
  },
  // Amusement park side closed after the 2007 season; rides were sold off in 2008.
  "Geauga Lake": {
    closedYear: 2007,
    source: "https://en.wikipedia.org/wiki/Roller_Coaster_(Pap%C3%A9a_Parc)",
  },
};

type InstallFix = {
  fix: Partial<
    Pick<
      Coaster,
      | "name"
      | "status"
      | "opening_year"
      | "closing_year"
      | "manufacturer"
      | "wikidata_id"
      | "height_ft"
      | "speed_mph"
      | "length_ft"
      | "duration_s"
      | "image_url"
      | "enwiki_title"
      | "summary_text"
    >
  >;
  source: string;
};

/** Clears stats, photo and article a row borrowed from a namesake ride at another park. */
const NO_BORROWED_DETAILS = {
  height_ft: null,
  speed_mph: null,
  length_ft: null,
  duration_s: null,
  image_url: null,
  enwiki_title: null,
  summary_text: null,
} as const;

// Bartlett's Flying Turns ran 1930 – 28 Sep 1969. The row carries Knoebels' 2013
// Flying Turns (Q1434625), so drop that ride's item, maker, stats and article.
const EUCLID_BEACH_FLYING_TURNS: InstallFix = {
  fix: {
    name: "Flying Turns",
    status: "Defunct",
    opening_year: 1930,
    closing_year: 1969,
    manufacturer: "John Norman Bartlett",
    wikidata_id: null,
    ...NO_BORROWED_DETAILS,
  },
  source: "https://en.wikipedia.org/wiki/Flying_Turns",
};

// Fixes for Wikidata rows that rename them. The sync writes the fixed name back, so each
// is also keyed under that name.

// Montaña Infinitum, Montaña Triple Loop, then Quimera (2017–2019) at La Feria. The
// Wikidata row is named after the ride's current Indiana Beach install.
const LA_FERIA_QUIMERA: InstallFix = {
  fix: { name: "Quimera", status: "Defunct", opening_year: 2007, closing_year: 2019 },
  source: "https://en.wikipedia.org/wiki/All_American_Triple_Loop",
};

// Timber Topper, then Rock n' Roller Coaster, 1972 until the park closed in 1997.
const OPRYLAND_ROCK_N_ROLLER: InstallFix = {
  fix: { name: "Rock n' Roller Coaster", status: "Defunct", opening_year: 1972, closing_year: 1997 },
  source: "https://en.wikipedia.org/wiki/Canyon_Blaster_(Great_Escape)",
};

// Tokyo's copy opened 15 Apr 1996 as Gadget's Go Coaster; the row had Disneyland's name and year.
const TOKYO_GADGET: InstallFix = {
  fix: { name: "Gadget's Go Coaster", opening_year: 1996 },
  source: "https://en.wikipedia.org/wiki/Chip_%27n%27_Dale%27s_Gadgetcoaster",
};

// Renamed from Wile E. Coyote Canyon Blaster in 2016.
const SFOG_JOKER_FUNHOUSE: InstallFix = {
  fix: { name: "The Joker Funhouse Coaster" },
  source: "https://en.wikipedia.org/wiki/The_Joker_Funhouse_Coaster",
};

const LEGOLAND_DEUTSCHLAND_RENNEN: InstallFix = {
  fix: { name: "Das große LEGO-Rennen" },
  source: "https://en.wikipedia.org/wiki/Lego_Technic_Test_Track",
};

// T2 from 1995, T3 from 2015; closed 5 Sep 2022 and moved to Wonderla as Garuda Glide.
const KENTUCKY_KINGDOM_T3: InstallFix = {
  fix: { name: "T3", status: "Defunct", opening_year: 1995, closing_year: 2022 },
  source: "https://en.wikipedia.org/wiki/Garuda_Glide",
};

// Wild Kitten, Great Chase, Tombstone Tumbler, then Cactus Coaster from 2008; it left for
// Frontier City (as Wild Kitty) after 2012.
const ELITCH_CACTUS_COASTER: InstallFix = {
  fix: { name: "Cactus Coaster", status: "Defunct", opening_year: 1995, closing_year: 2012 },
  source: "https://en.wikipedia.org/wiki/Wild_Kitty",
};

// Surfrider ran from September 2007 until 2020; removed in 2023 for Movie World.
const WET_N_WILD_SURFRIDER: InstallFix = {
  fix: { name: "Surfrider", status: "Defunct", opening_year: 2007, closing_year: 2020 },
  source: "https://en.wikipedia.org/wiki/The_Flash:_Speed_Force",
};

// Screamin' Demon, later Demon, 1977–1987; then Thunderbolt Express at Camden Park.
const KINGS_ISLAND_DEMON: InstallFix = {
  fix: { name: "Demon", status: "Defunct", opening_year: 1977, closing_year: 1987 },
  source: "https://en.wikipedia.org/wiki/Thunderbolt_Express",
};

// SkyRider ran 1985 – 1 Sep 2014, then moved to Cavallino Matto as Freestyle.
const CANADAS_WONDERLAND_SKYRIDER: InstallFix = {
  fix: { name: "SkyRider", status: "Defunct", opening_year: 1985, closing_year: 2014 },
  source: "https://en.wikipedia.org/wiki/Freestyle_(roller_coaster)",
};

// Kanonen ran 2005 – 30 Dec 2016, then moved to Lost Island as Matugani.
const LISEBERG_KANONEN: InstallFix = {
  fix: { name: "Kanonen", status: "Defunct", opening_year: 2005, closing_year: 2016 },
  source: "https://en.wikipedia.org/wiki/Matugani",
};

/** Former installations keyed by park name, then by the catalog row's name. */
export const FORMER_INSTALL_FIXES: Record<string, Record<string, InstallFix>> = {
  "Cedar Point": {
    // The 1970 Wildcat left after the 1978 season (Valleyfair, then Jolly Roger).
    "Wildcat (Jolly Roger Amusement Park)": {
      fix: { status: "Defunct", opening_year: 1970, closing_year: 1978 },
      source: "https://en.wikipedia.org/wiki/Wildcat_(Jolly_Roger_Amusement_Park)",
    },
  },
  "Knott's Berry Farm": {
    // Arrow's prototype Corkscrew ran at Knott's 1975–1989, then moved to Silverwood.
    "Corkscrew (Silverwood)": {
      fix: { status: "Defunct", opening_year: 1975, closing_year: 1989 },
      source: "https://en.wikipedia.org/wiki/Corkscrew_(Silverwood)",
    },
  },
  "Euclid Beach Park": {
    // The park's first coaster, a Switchback Railway, ran 1896–1904. The row had Coney
    // Island's 1884 ride: its opening, stats, photo and article.
    "Switchback Railway (Euclid Beach Park)": {
      fix: {
        name: "Switchback Railway",
        status: "Defunct",
        opening_year: 1896,
        closing_year: 1904,
        ...NO_BORROWED_DETAILS,
      },
      source: "https://en.wikipedia.org/wiki/Euclid_Beach_Park",
    },
    "Flying Turns (Euclid Beach Park)": EUCLID_BEACH_FLYING_TURNS,
    // The sync writes the fixed name back, so match the row under that name too.
    "Flying Turns": EUCLID_BEACH_FLYING_TURNS,
  },
  "Six Flags Great America": {
    // Iron Wolf ran here 1990 – 5 Sep 2011, then moved to Six Flags America (later Firebird).
    "Firebird (roller coaster)": {
      fix: { name: "Iron Wolf", status: "Defunct", opening_year: 1990, closing_year: 2011 },
      source: "https://en.wikipedia.org/wiki/Firebird_(roller_coaster)",
    },
    // Rolling Thunder ran 1989–1995 (RCDB 494, and the article's history); the infobox's
    // 1997 is when it left storage for Great Escape.
    "Alpine Bobsled": {
      fix: { name: "Rolling Thunder", status: "Defunct", opening_year: 1989, closing_year: 1995 },
      source: "https://en.wikipedia.org/wiki/Alpine_Bobsled",
    },
    "Barrels O' Fun": {
      fix: { name: "Ragin' Cajun", status: "Defunct", opening_year: 2004, closing_year: 2013 },
      source: "https://en.wikipedia.org/wiki/Barrels_O%27_Fun",
    },
    "Flashback (Six Flags Magic Mountain)": {
      fix: { name: "Z-Force", status: "Defunct", opening_year: 1985, closing_year: 1987 },
      source: "https://en.wikipedia.org/wiki/Flashback_(Six_Flags_Magic_Mountain)",
    },
  },
  // Batman The Escape ran as Shockwave at Magic Mountain (1986–1988) and Great Adventure
  // (1990–1992) before AstroWorld renamed it in 1993.
  "Six Flags Magic Mountain": {
    "Batman The Escape": {
      fix: { name: "Shockwave", status: "Defunct", opening_year: 1986, closing_year: 1988 },
      source: "https://en.wikipedia.org/wiki/Batman_The_Escape",
    },
    "La Vibora": {
      fix: { name: "Sarajevo Bobsleds", status: "Defunct", opening_year: 1984, closing_year: 1985 },
      source: "https://en.wikipedia.org/wiki/La_Vibora",
    },
    // The park's own Giovanola Goliath (Q510289, opened 2000). /extend matched it to the
    // New England Goliath and wrote Déjà Vu's years and that ride's article onto it.
    Goliath: {
      fix: {
        status: "Operating",
        opening_year: 2000,
        closing_year: null,
        manufacturer: "Giovanola",
        enwiki_title: "Goliath (Six Flags Magic Mountain)",
        summary_text: null,
      },
      source: "https://en.wikipedia.org/wiki/Goliath_(Six_Flags_Magic_Mountain)",
    },
  },
  "Six Flags Great Adventure": {
    "Batman The Escape": {
      fix: { name: "Shockwave", status: "Defunct", opening_year: 1990, closing_year: 1992 },
      source: "https://en.wikipedia.org/wiki/Batman_The_Escape",
    },
    "Alpine Bobsled": {
      fix: { name: "Sarajevo Bobsled", status: "Defunct", opening_year: 1984, closing_year: 1988 },
      source: "https://en.wikipedia.org/wiki/Alpine_Bobsled",
    },
    "Ultra Twister (Six Flags)": {
      fix: { status: "Defunct", opening_year: 1986, closing_year: 1988 },
      source: "https://en.wikipedia.org/wiki/Ultra_Twister_(Six_Flags)",
    },
  },
  "Six Flags America": {
    // Ragin' Cajun 2014 – 2 Nov 2025, now Barrels O' Fun at Great Adventure.
    "Barrels O' Fun": {
      fix: { name: "Ragin' Cajun", status: "Defunct", opening_year: 2014, closing_year: 2025 },
      source: "https://en.wikipedia.org/wiki/Barrels_O%27_Fun",
    },
    // One Lightnin' Loops track ran here (then Adventure World) as Python, 1993–1998.
    "Lightnin' Loops": {
      fix: { name: "Python", status: "Defunct", opening_year: 1993, closing_year: 1998 },
      source: "https://en.wikipedia.org/wiki/Six_Flags_America",
    },
  },
  "Six Flags Over Texas": {
    "Boomerang (Mid America Adventure)": {
      fix: { name: "Flashback", status: "Defunct", opening_year: 1989, closing_year: 2012 },
      source: "https://en.wikipedia.org/wiki/Boomerang_(Mid_America_Adventure)",
    },
  },
  "Geauga Lake": {
    // Road Runner Express (2000), renamed Beaver Land Mine Ride; moved to Papéa Parc in 2008.
    "Roller Coaster (Papéa Parc)": {
      fix: { name: "Beaver Land Mine Ride", status: "Defunct", opening_year: 2000, closing_year: 2007 },
      source: "https://en.wikipedia.org/wiki/Roller_Coaster_(Pap%C3%A9a_Parc)",
    },
    "Firehawk (roller coaster)": {
      fix: { name: "X-Flight", status: "Defunct", opening_year: 2001, closing_year: 2006 },
      source: "https://en.wikipedia.org/wiki/Firehawk_(roller_coaster)",
    },
    // Superman: Ultimate Escape (2000–2003), then Steel Venom until 2006.
    "Possessed (roller coaster)": {
      fix: { name: "Steel Venom", status: "Defunct", opening_year: 2000, closing_year: 2006 },
      source: "https://en.wikipedia.org/wiki/Possessed_(roller_coaster)",
    },
    // The Mind Eraser (1996–2003), then Head Spin until the park closed.
    "The Flying Cobras": {
      fix: { name: "Head Spin", status: "Defunct", opening_year: 1996, closing_year: 2007 },
      source: "https://en.wikipedia.org/wiki/The_Flying_Cobras",
    },
  },
  "Worlds of Fun": {
    // The park's own Vekoma Boomerang (2000–) was filed under Six Flags México's ride,
    // with that ride's height and photo.
    "Batgirl Batarang": {
      fix: { name: "Boomerang", status: "Operating", opening_year: 2000, closing_year: null, ...NO_BORROWED_DETAILS },
      source: "https://en.wikipedia.org/wiki/Worlds_of_Fun",
    },
    // Zambezi Zinger ran here 1973–1997, then moved to Parque del Café as Montaña Rusa.
    "Montaña Rusa (Parque del Café)": {
      fix: { name: "Zambezi Zinger", status: "Defunct", opening_year: 1973, closing_year: 1997 },
      source: "https://en.wikipedia.org/wiki/Monta%C3%B1a_Rusa_(Parque_del_Caf%C3%A9)",
    },
  },
  "Flamingo Land": {
    "All American Triple Loop": {
      fix: { name: "Magnum Force", status: "Defunct", opening_year: 2000, closing_year: 2005 },
      source: "https://en.wikipedia.org/wiki/All_American_Triple_Loop",
    },
  },
  "La Feria Chapultepec Mágico": {
    "All American Triple Loop": LA_FERIA_QUIMERA,
    Quimera: LA_FERIA_QUIMERA,
  },
  "Blackpool Pleasure Beach": {
    // Space Invader (1984), Space Invader 2 from 2004; closed September 2008.
    "Astro Storm": {
      fix: { name: "Space Invader 2", status: "Defunct", opening_year: 1984, closing_year: 2008 },
      source: "https://en.wikipedia.org/wiki/Astro_Storm",
    },
  },
  "Luna Park Sydney": {
    // Closed after a collision on 16 April 1979; demolished in 1981.
    "Big Dipper (Luna Park Sydney, 1935)": {
      fix: { status: "Defunct", opening_year: 1935, closing_year: 1979 },
      source: "https://en.wikipedia.org/wiki/Big_Dipper_(Luna_Park_Sydney,_1935)",
    },
    // The 1995 Arrow Big Dipper; sold to Dreamworld in 2001 (now The Gold Coaster).
    "The Gold Coaster": {
      fix: { name: "Big Dipper", status: "Defunct", opening_year: 1995, closing_year: 2001 },
      source: "https://en.wikipedia.org/wiki/The_Gold_Coaster",
    },
  },
  Knoebels: {
    Bocaraca: {
      fix: { name: "Whirlwind", status: "Defunct", opening_year: 1993, closing_year: 2004 },
      source: "https://en.wikipedia.org/wiki/Bocaraca",
    },
  },
  // Rye Playland (New York).
  Playland: {
    Bocaraca: {
      fix: { name: "Whirlwind", status: "Defunct", opening_year: 1984, closing_year: 1992 },
      source: "https://en.wikipedia.org/wiki/Bocaraca",
    },
  },
  "Opryland USA": {
    // The extend row is a twin of the park's own Wikidata row; both get the Opryland name.
    "Canyon Blaster (Great Escape)": OPRYLAND_ROCK_N_ROLLER,
    "Rock n' Roller Coaster": OPRYLAND_ROCK_N_ROLLER,
    "Kong (roller coaster)": {
      fix: { name: "Hangman", status: "Defunct", opening_year: 1995, closing_year: 1997 },
      source: "https://en.wikipedia.org/wiki/Kong_(roller_coaster)",
    },
  },
  "Tokyo Disneyland": {
    "Chip 'n' Dale's Gadgetcoaster": TOKYO_GADGET,
    "Gadget's Go Coaster": TOKYO_GADGET,
  },
  "Six Flags New Orleans": {
    "Chupacabra (roller coaster)": {
      fix: { name: "Batman: The Ride", status: "Defunct", opening_year: 2003, closing_year: 2005 },
      source: "https://en.wikipedia.org/wiki/Chupacabra_(roller_coaster)",
    },
    // The park never reopened after Hurricane Katrina (August 2005).
    "The Jester (roller coaster)": {
      fix: { status: "Defunct", opening_year: 2003, closing_year: 2005 },
      source: "https://en.wikipedia.org/wiki/The_Jester_(roller_coaster)",
    },
  },
  "Celebration City": {
    // Firestorm (1999–2001), Thunderbolt from 2003; closed 25 Oct 2008.
    "Cliffhanger (Colorado roller coaster)": {
      fix: { name: "Thunderbolt", status: "Defunct", opening_year: 1999, closing_year: 2008 },
      source: "https://en.wikipedia.org/wiki/Cliffhanger_(Colorado_roller_coaster)",
    },
  },
  "Skara Sommarland": {
    "Cobra (La Ronde)": {
      fix: { name: "Stand Up", status: "Defunct", opening_year: 1988, closing_year: 1994 },
      source: "https://en.wikipedia.org/wiki/Cobra_(La_Ronde)",
    },
  },
  "Dorney Park": {
    "Cosmic Coaster (Valleyfair)": {
      fix: { name: "Dragon Coaster", status: "Defunct", opening_year: 1992, closing_year: 2010 },
      source: "https://en.wikipedia.org/wiki/Cosmic_Coaster_(Valleyfair)",
    },
    Teststrecke: {
      fix: { name: "Laser", status: "Defunct", opening_year: 1986, closing_year: 2008 },
      source: "https://en.wikipedia.org/wiki/Teststrecke",
    },
  },
  Valleyfair: {
    // Moved here from Dorney Park; opened 14 May 2011.
    "Cosmic Coaster (Valleyfair)": {
      fix: { opening_year: 2011 },
      source: "https://en.wikipedia.org/wiki/Cosmic_Coaster_(Valleyfair)",
    },
    "Wildcat (Jolly Roger Amusement Park)": {
      fix: { name: "Wild Rails", status: "Defunct", opening_year: 1979, closing_year: 1998 },
      source: "https://en.wikipedia.org/wiki/Wildcat_(Jolly_Roger_Amusement_Park)",
    },
  },
  "Six Flags AstroWorld": {
    "Ednör – L'Attaque": {
      fix: { name: "Serial Thriller", status: "Defunct", opening_year: 1999, closing_year: 2005 },
      source: "https://en.wikipedia.org/wiki/Edn%C3%B6r_%E2%80%93_L%27Attaque",
    },
    "Hornet (roller coaster)": {
      fix: { name: "Mayan Mindbender", status: "Defunct", opening_year: 1995, closing_year: 2005 },
      source: "https://en.wikipedia.org/wiki/Hornet_(roller_coaster)",
    },
    "Tsunami (roller coaster)": {
      fix: { name: "Texas Tornado", status: "Defunct", opening_year: 1998, closing_year: 2000 },
      source: "https://en.wikipedia.org/wiki/Tsunami_(roller_coaster)",
    },
  },
  // Travelled the German fair circuit 1995 – early 2008, then went to Gorky Park.
  Oktoberfest: {
    "Eurostar (roller coaster)": {
      fix: { closing_year: 2008 },
      source: "https://en.wikipedia.org/wiki/Eurostar_(roller_coaster)",
    },
  },
  "Six Flags Over Georgia": {
    "Flashback (Six Flags Magic Mountain)": {
      fix: { name: "Z-Force", status: "Defunct", opening_year: 1988, closing_year: 1991 },
      source: "https://en.wikipedia.org/wiki/Flashback_(Six_Flags_Magic_Mountain)",
    },
    "Wile E. Coyote Canyon Blaster": SFOG_JOKER_FUNHOUSE,
    "The Joker Funhouse Coaster": SFOG_JOKER_FUNHOUSE,
  },
  Särkänniemi: {
    "Half Pipe (roller coaster)": {
      fix: { opening_year: 2003 },
      source: "https://en.wikipedia.org/wiki/Half_Pipe_(roller_coaster)",
    },
  },
  "Wonderland Park (Texas)": {
    // The Wikidata row still carries the AstroWorld name.
    "Mayan Mindbender": {
      fix: { name: "Hornet" },
      source: "https://en.wikipedia.org/wiki/Hornet_(roller_coaster)",
    },
  },
  // An independent operator ran the portable Jet Star near Astroland 1976–1977. The row
  // had Casino Pier's Jet Star (a different ride): its stats, photo and article.
  "Coney Island": {
    "Jet Star (Luna Park)": {
      fix: { name: "Jet Star", status: "Defunct", opening_year: 1976, closing_year: 1977, ...NO_BORROWED_DETAILS },
      source: "https://en.wikipedia.org/wiki/Jet_Star_(Luna_Park)",
    },
  },
  "Legoland Windsor": {
    "Lego Technic Test Track": {
      fix: { name: "Jungle Coaster", status: "Defunct", opening_year: 2004, closing_year: 2009 },
      source: "https://en.wikipedia.org/wiki/Lego_Technic_Test_Track",
    },
  },
  "Legoland Deutschland": {
    "Lego Technic Test Track": LEGOLAND_DEUTSCHLAND_RENNEN,
    "Das große LEGO-Rennen": LEGOLAND_DEUTSCHLAND_RENNEN,
  },
  "Frontier City": {
    // The other Lightnin' Loops track, rebuilt here as Diamondback.
    "Lightnin' Loops": {
      fix: { name: "Diamondback", status: "Operating", opening_year: 1993, closing_year: null },
      source: "https://en.wikipedia.org/wiki/Lightnin%27_Loops",
    },
    // Closed at the end of the 2018 season.
    "Wild Kitty": {
      fix: { closing_year: 2018 },
      source: "https://en.wikipedia.org/wiki/Wild_Kitty",
    },
  },
  "California's Great America": {
    "Nighthawk (roller coaster)": {
      fix: { name: "Stealth", status: "Defunct", opening_year: 2000, closing_year: 2003 },
      source: "https://en.wikipedia.org/wiki/Nighthawk_(roller_coaster)",
    },
  },
  "Six Flags Darien Lake": {
    "Nightmare at Crack Axle Canyon": {
      fix: { name: "Nightmare at Phantom Cave", status: "Defunct", opening_year: 1996, closing_year: 1998 },
      source: "https://en.wikipedia.org/wiki/Nightmare_at_Crack_Axle_Canyon",
    },
  },
  "Kentucky Kingdom": {
    "Nightmare at Crack Axle Canyon": {
      fix: { name: "Starchaser", status: "Defunct", opening_year: 1987, closing_year: 1995 },
      source: "https://en.wikipedia.org/wiki/Nightmare_at_Crack_Axle_Canyon",
    },
    "Garuda Glide": KENTUCKY_KINGDOM_T3,
    T3: KENTUCKY_KINGDOM_T3,
  },
  // Opened here as Jet Star between 1968 and 1972; moved to Noble Park Funland after 1984.
  "Beech Bend Park": {
    "Nightmare at Crack Axle Canyon": {
      fix: { name: "Jet Star", status: "Defunct", opening_year: null, closing_year: 1984 },
      source: "https://en.wikipedia.org/wiki/Nightmare_at_Crack_Axle_Canyon",
    },
  },
  "Wonderland Sydney": {
    "Recoil (Wonderla Hyderabad)": {
      fix: { name: "Demon", status: "Defunct", opening_year: 1992, closing_year: 2004 },
      source: "https://en.wikipedia.org/wiki/Recoil_(Wonderla_Hyderabad)",
    },
  },
  "Parque Warner Madrid": {
    "Road Runner Rollercoaster": {
      fix: { name: "Correcaminos Bip, Bip" },
      source: "https://en.wikipedia.org/wiki/Road_Runner_Rollercoaster",
    },
  },
  "Six Flags Discovery Kingdom": {
    // Retired 16 Aug 2015.
    "Roar (roller coaster)": {
      fix: { status: "Defunct", opening_year: 1999, closing_year: 2015 },
      source: "https://en.wikipedia.org/wiki/Roar_(roller_coaster)",
    },
    "Tsunami (roller coaster)": {
      fix: { name: "Zonga", status: "Defunct", opening_year: 2003, closing_year: 2004 },
      source: "https://en.wikipedia.org/wiki/Tsunami_(roller_coaster)",
    },
  },
  "Busch Gardens Williamsburg": {
    // Wild Izzy (1996), then Wild Maus until 2003.
    "Sand Serpent": {
      fix: { name: "Wild Maus", status: "Defunct", opening_year: 1996, closing_year: 2003 },
      source: "https://en.wikipedia.org/wiki/Sand_Serpent",
    },
  },
  "Magic Springs and Crystal Falls": {
    "Sidewinder (Elitch Gardens)": {
      fix: { name: "Roaring Tornado", status: "Defunct", opening_year: 1980, closing_year: 1989 },
      source: "https://en.wikipedia.org/wiki/Sidewinder_(Elitch_Gardens)",
    },
  },
  "Elitch Gardens": {
    "Soarin' Eagle": {
      fix: { name: "Flying Coaster", status: "Defunct", opening_year: 2002, closing_year: 2007 },
      source: "https://en.wikipedia.org/wiki/Soarin%27_Eagle",
    },
    "Wild Kitty": ELITCH_CACTUS_COASTER,
    "Cactus Coaster": ELITCH_CACTUS_COASTER,
  },
  "Kuwait Entertainment City": {
    // Lightning ran 2004 – 5 Jun 2016; it reopened in India as Tanjora in 2025.
    Tanjora: {
      fix: { name: "Lightning", status: "Defunct", opening_year: 2004, closing_year: 2016 },
      source: "https://en.wikipedia.org/wiki/Tanjora",
    },
  },
  "Six Flags Mexico": {
    "The Dark Knight Coaster": {
      fix: { opening_year: 2009 },
      source: "https://en.wikipedia.org/wiki/The_Dark_Knight_Coaster",
    },
  },
  "Wet'n'Wild Gold Coast": {
    "The Flash: Speed Force": WET_N_WILD_SURFRIDER,
    Surfrider: WET_N_WILD_SURFRIDER,
  },
  "Six Flags Fiesta Texas": {
    "The Jester (roller coaster)": {
      fix: { name: "The Joker's Revenge", status: "Defunct", opening_year: 1996, closing_year: 2001 },
      source: "https://en.wikipedia.org/wiki/The_Jester_(roller_coaster)",
    },
  },
  Expoland: {
    "The Monster (Walygator Parc)": {
      fix: { name: "Orochi", status: "Defunct", opening_year: 1996, closing_year: 2007 },
      source: "https://en.wikipedia.org/wiki/The_Monster_(Walygator_Parc)",
    },
  },
  "Kings Island": {
    "Thunderbolt Express": KINGS_ISLAND_DEMON,
    Demon: KINGS_ISLAND_DEMON,
  },
  "Walibi Holland": {
    "Tiger Express (roller coaster)": {
      fix: { name: "Flying Dutchman Gold Mine", status: "Defunct", opening_year: 2000, closing_year: 2010 },
      source: "https://en.wikipedia.org/wiki/Tiger_Express_(roller_coaster)",
    },
  },
  "Gröna Lund": {
    "Tsunami (roller coaster)": {
      fix: { name: "Thriller", status: "Defunct", opening_year: 1996, closing_year: 1996 },
      source: "https://en.wikipedia.org/wiki/Tsunami_(roller_coaster)",
    },
  },
  "Mid America Adventure": {
    "Viper (Six Flags AstroWorld)": {
      fix: { name: "Jet Scream", status: "Defunct", opening_year: 1981, closing_year: 1988 },
      source: "https://en.wikipedia.org/wiki/Viper_(Six_Flags_AstroWorld)",
    },
  },
  Carowinds: {
    "Woodstock's Air Rail": {
      fix: { name: "Kiddy Hawk" },
      source: "https://en.wikipedia.org/wiki/Woodstock%27s_Air_Rail",
    },
  },
  "Canada's Wonderland": {
    "Freestyle (roller coaster)": CANADAS_WONDERLAND_SKYRIDER,
    SkyRider: CANADAS_WONDERLAND_SKYRIDER,
  },
  "Six Flags New England": {
    // Déjà Vu ran here as Goliath 2012–2019; Vekoma built it (the row had RMC).
    "Goliath (Six Flags New England)": {
      fix: { status: "Defunct", opening_year: 2012, closing_year: 2019, manufacturer: "Vekoma" },
      source: "https://en.wikipedia.org/wiki/Goliath_(Six_Flags_New_England)",
    },
  },
  Liseberg: {
    Matugani: LISEBERG_KANONEN,
    Kanonen: LISEBERG_KANONEN,
  },
};

/**
 * Rows attached to a park the ride never ran at, usually because a park name in a
 * Wikipedia infobox matched a different park with a similar name. Hidden from that park.
 */
export const MISATTRIBUTED_ROWS: Record<string, Record<string, string>> = {
  // Rye Playland (New York).
  Playland: {
    // Jumbo Jet ran at Palace Playland (Maine).
    "Jumbo Jet (Chelyuskintsev Park)": "https://en.wikipedia.org/wiki/Jumbo_Jet_(Chelyuskintsev_Park)",
    // Playland in Vancouver.
    "Corkscrew (Playland)": "https://en.wikipedia.org/wiki/Corkscrew_(Playland)",
    ThunderVolt: "https://en.wikipedia.org/wiki/ThunderVolt",
  },
  "Dreamland Margate": {
    // The Great Scenic Railway has run only at Luna Park Melbourne (since 1912). Dreamland's
    // own Scenic Railway is a separate row; Euclid Beach's Scenic Railway (1907–1937) was a
    // different ride and this row carries the Melbourne ride's Wikidata item.
    "The Great Scenic Railway": "https://en.wikipedia.org/wiki/The_Great_Scenic_Railway",
    // Jumbo Jet's "Dreamland" (2010–2014) is Dreamland in Minsk, Belarus.
    "Jumbo Jet (Chelyuskintsev Park)": "https://en.wikipedia.org/wiki/Jumbo_Jet_(Chelyuskintsev_Park)",
  },
  "Euclid Beach Park": {
    "The Great Scenic Railway": "https://en.wikipedia.org/wiki/The_Great_Scenic_Railway",
  },
  // After AstroWorld closed the track was moved to Darien Lake, stored and never reassembled.
  "Six Flags Darien Lake": {
    "Batman The Escape": "https://en.wikipedia.org/wiki/Batman_The_Escape",
  },
  // Firebird ran at Six Flags Great America (as Iron Wolf) and Six Flags America only.
  "Six Flags Magic Mountain": {
    Firebird: "https://en.wikipedia.org/wiki/Firebird_(roller_coaster)",
  },
  // Infobox parks that matched Six Flags America instead of the right park.
  "Six Flags America": {
    // Tony Hawk's Big Spin left Discovery Kingdom in 2012 and reopened as The Joker at
    // Six Flags México in 2013; it never ran in Maryland.
    "The Joker (Six Flags México)": "https://en.wikipedia.org/wiki/The_Joker_(Six_Flags_M%C3%A9xico)",
    // Rafaela Padilla (1984–1986), then Reino Aventura / Six Flags México since 1988.
    "Batgirl Batarang": "https://en.wikipedia.org/wiki/Batgirl_Batarang",
    // Six Flags México's copy (2009).
    "The Dark Knight Coaster": "https://en.wikipedia.org/wiki/The_Dark_Knight_Coaster",
    // Great Escape (Six Flags Great Escape and Hurricane Harbor), 1998–2023.
    "Alpine Bobsled": "https://en.wikipedia.org/wiki/Alpine_Bobsled",
    // These three ran at Six Flags Kentucky Kingdom (The Vampire, Road Runner Express, Chang).
    "Flashback (Six Flags New England)": "https://en.wikipedia.org/wiki/Flashback_(Six_Flags_New_England)",
    "Gotham City Gauntlet: Escape from Arkham Asylum":
      "https://en.wikipedia.org/wiki/Gotham_City_Gauntlet:_Escape_from_Arkham_Asylum",
    "Green Lantern (Six Flags Great Adventure)": "https://en.wikipedia.org/wiki/Green_Lantern_(Six_Flags_Great_Adventure)",
  },
  // Sunway Lagoon (Malaysia), not Lagoon in Utah.
  Lagoon: {
    "All American Triple Loop": "https://en.wikipedia.org/wiki/All_American_Triple_Loop",
  },
  // "Luna Park" here is Coney Island. Big Dipper ran at Luna Park Glenelg (South Australia);
  // Jet Star is at Luna Park La Palmyre (France) and was only near Astroland, not Luna Park.
  "Luna Park": {
    "Big Dipper (Luna Park Sydney, 1935)": "https://en.wikipedia.org/wiki/Big_Dipper_(Luna_Park_Sydney,_1935)",
    "Jet Star (Luna Park)": "https://en.wikipedia.org/wiki/Jet_Star_(Luna_Park)",
  },
  // Adventure World in Perth. Recoil ran at Alabama Adventure (as Zoomerang), 2005–2011.
  "Adventure World": {
    "Recoil (Wonderla Hyderabad)": "https://en.wikipedia.org/wiki/Recoil_(Wonderla_Hyderabad)",
  },
  // Lake Compounce has its own Zoomerang row; Recoil never ran there.
  "Lake Compounce": {
    Recoil: "https://en.wikipedia.org/wiki/Recoil_(Wonderla_Hyderabad)",
  },
  // Shanghai Disneyland matched Disneyland (Anaheim).
  Disneyland: {
    "RC Racer": "https://en.wikipedia.org/wiki/RC_Racer",
    "Seven Dwarfs Mine Train": "https://en.wikipedia.org/wiki/Seven_Dwarfs_Mine_Train",
    "Tron Lightcycle Power Run": "https://en.wikipedia.org/wiki/Tron_Lightcycle_Power_Run",
  },
  // Speed – The Ride ran only at the Sahara (2000–2011).
  "New York-New York Hotel and Casino": {
    "Speed – The Ride": "https://en.wikipedia.org/wiki/Speed_%E2%80%93_The_Ride",
  },
  "Stratosphere Tower": {
    "Speed – The Ride": "https://en.wikipedia.org/wiki/Speed_%E2%80%93_The_Ride",
  },
  // Wild Zone Adventures in Chatham, Ontario, not Wild Adventures in Georgia.
  "Wild Adventures": {
    "Wild West Express Coaster": "https://en.wikipedia.org/wiki/Wild_West_Express_Coaster",
  },
  // Sesame Place San Diego; this park is the Pennsylvania one.
  "Sesame Place": {
    "Super Grover's Box Car Derby": "https://en.wikipedia.org/wiki/Super_Grover%27s_Box_Car_Derby",
  },
  // Tiger Express is at La Mer de Sable, not Parc Astérix.
  "Parc Astérix": {
    "Tiger Express": "https://en.wikipedia.org/wiki/Tiger_Express_(roller_coaster)",
  },
  // Superman The Ride is at Six Flags New England; Wind Chaser at Kentucky Kingdom; The Joker
  // Funhouse Coaster at Six Flags Over Georgia.
  "Six Flags Great Adventure": {
    "Superman The Ride": "https://en.wikipedia.org/wiki/Superman_The_Ride",
    "Wind Chaser": "https://en.wikipedia.org/wiki/Wind_Chaser",
    "The Joker Funhouse Coaster": "https://en.wikipedia.org/wiki/The_Joker_Funhouse_Coaster",
  },
  "Adventureland (Iowa)": {
    "Wind Chaser": "https://en.wikipedia.org/wiki/Wind_Chaser",
  },
};

export function isMisattributedRow(coasterName: string, parkName: string | null | undefined): boolean {
  return Boolean(parkName && MISATTRIBUTED_ROWS[parkName]?.[coasterName]);
}

/** Apply closed-park and former-installation corrections for a row at a known park. */
export function applyParkScopedFixes<
  T extends Pick<Coaster, "name" | "status"> & Partial<Pick<Coaster, "opening_year" | "closing_year">>,
>(coaster: T, parkName: string | null | undefined): T {
  if (!parkName) return coaster;
  let out = coaster;

  const install = FORMER_INSTALL_FIXES[parkName]?.[coaster.name];
  if (install) out = { ...out, ...install.fix };

  const closure = CLOSED_PARKS[parkName];
  if (closure) {
    const closing = effectiveClosingYear(out.opening_year, out.closing_year);
    out = {
      ...out,
      status: "Defunct",
      // Keep an earlier, ride-specific closing year; otherwise the park's closing year.
      closing_year: closing != null && closing <= closure.closedYear ? closing : closure.closedYear,
    };
  }

  return out;
}
