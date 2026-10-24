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
  // Amusement park side closed after the 2007 season; rides were sold off in 2008.
  "Geauga Lake": {
    closedYear: 2007,
    source: "https://en.wikipedia.org/wiki/Roller_Coaster_(Pap%C3%A9a_Parc)",
  },
};

type InstallFix = {
  fix: Partial<Pick<Coaster, "name" | "status" | "opening_year" | "closing_year">>;
  source: string;
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
  "Geauga Lake": {
    // Road Runner Express (2000), renamed Beaver Land Mine Ride; moved to Papéa Parc in 2008.
    "Roller Coaster (Papéa Parc)": {
      fix: { name: "Beaver Land Mine Ride", status: "Defunct", opening_year: 2000, closing_year: 2007 },
      source: "https://en.wikipedia.org/wiki/Roller_Coaster_(Pap%C3%A9a_Parc)",
    },
  },
};

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
