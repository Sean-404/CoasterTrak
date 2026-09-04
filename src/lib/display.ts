import { canonicalCountryLabel, unjamGeoLabel } from "@/lib/geo-country";

/**
 * Strip Wikipedia disambiguation suffixes from coaster names for cleaner display.
 * e.g. "Wicker Man (roller coaster)" → "Wicker Man"
 *      "Corkscrew (Alton Towers)"    → "Corkscrew"
 */
export function cleanCoasterName(name: string): string {
  return name
    .replace(/\s*\([^)]+\)\s*$/, "")
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse "Mack Rides Mack Rides" → "Mack Rides" (wiki table cell duplication). */
export function collapseRepeatedPhrase(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return text.trim();
  for (let len = Math.floor(words.length / 2); len >= 1; len--) {
    const left = words.slice(0, len).join(" ");
    const right = words.slice(len, len * 2).join(" ");
    if (left.toLowerCase() === right.toLowerCase()) {
      return [left, ...words.slice(len * 2)].join(" ").trim();
    }
  }
  return text.trim();
}

type ManufacturerSegment = {
  brand: string;
  locations: string | null;
};

function parseManufacturerSegments(normalized: string): ManufacturerSegment[] {
  return normalized
    .split(/\s*·\s*/)
    .map((part) => {
      const cells = part
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean);
      // Wiki table rows often look like "Vekoma|Vekoma (Orlando, Japan)".
      const chosen =
        cells.find((cell) => /\([^)]+\)/.test(cell)) ?? cells[cells.length - 1] ?? part;
      const m = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(chosen);
      const brand = collapseRepeatedPhrase((m?.[1] ?? chosen).trim());
      const locations = m?.[2]?.trim() || null;
      return brand ? { brand, locations } : null;
    })
    .filter((seg): seg is ManufacturerSegment => Boolean(seg));
}

function manufacturerLocationsMatchPark(
  locations: string | null,
  parkHay: string,
): boolean {
  if (!locations || !parkHay.trim()) return false;
  const locs = locations
    .split(/[,/]/)
    .map((loc) => loc.trim().toLowerCase())
    .filter((loc) => loc.length >= 3);

  for (const loc of locs) {
    if (parkHay.includes(loc)) return true;
    if (loc === "orlando" && /orlando|islands of adventure|universal orlando|\bflorida\b/.test(parkHay)) {
      return true;
    }
    if (loc === "hollywood" && /hollywood|universal studios hollywood|\bcalifornia\b/.test(parkHay)) {
      return true;
    }
    if (loc === "japan" && /japan|osaka|universal studios japan/.test(parkHay)) return true;
    if (loc === "beijing" && /beijing|china|universal studios beijing/.test(parkHay)) return true;
    if (loc === "paris" && /paris|france|disneyland park|disneyland paris/.test(parkHay)) {
      return true;
    }
    if (loc === "california" && /california|anaheim|disneyland|disney california/.test(parkHay)) {
      return true;
    }
    if (loc === "florida" && /florida|orlando|magic kingdom|epcot|animal kingdom/.test(parkHay)) {
      return true;
    }
    if (loc === "tokyo" && /tokyo|japan/.test(parkHay)) return true;
  }
  return false;
}

/**
 * Wikipedia multi-install manufacturer cells often lose `<br>` separators when scraped,
 * producing strings like "Arrow Development (Florida)Dynamic Structures (rebuild)".
 * Also strip leftover wiki markup brackets and collapse duplicated brand labels from
 * wikitable `{{!}}` cells ("Vekoma Vekoma (Orlando, Japan)").
 */
export function normalizeManufacturerLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw)
    .replace(/\{\{!\}\}/gi, "|")
    .replace(/\{\{[!()]+!\}\}/gi, " ")
    .replace(/[\[\]]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  s = s.replace(/\)(?=[A-Z])/g, ") · ");
  s = s.replace(/\s*·\s*/g, " · ").trim();

  const segments = parseManufacturerSegments(s);
  if (!segments.length) return null;

  const parts = segments.map((seg) =>
    seg.locations ? `${seg.brand} (${seg.locations})` : seg.brand,
  );
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((u) => u.toLowerCase() === part.toLowerCase())) unique.push(part);
  }
  return unique.join(" · ") || null;
}

/**
 * Compact manufacturer for UI pills. When park context is known, prefer the install that
 * matches that park (e.g. Hippogriff → Vekoma at Islands of Adventure, Mack at Hollywood).
 */
export function formatManufacturerLabel(
  raw: string | null | undefined,
  opts?: { parkName?: string | null; country?: string | null },
): string | null {
  const normalized = normalizeManufacturerLabel(raw);
  if (!normalized) return null;

  const segments = parseManufacturerSegments(normalized);
  if (!segments.length) return null;

  const parkHay = `${opts?.parkName ?? ""} ${opts?.country ?? ""}`.toLowerCase();
  if (parkHay.trim()) {
    const matched = segments.find((seg) =>
      manufacturerLocationsMatchPark(seg.locations, parkHay),
    );
    if (matched) return matched.brand;
  }

  const brands: string[] = [];
  for (const seg of segments) {
    if (!brands.some((b) => b.toLowerCase() === seg.brand.toLowerCase())) {
      brands.push(seg.brand);
    }
  }
  return brands.join(" · ") || null;
}

/** "Park name · Country" when country is known — disambiguates Disney/Universal and other chains. */
export function formatParkLabel(
  name: string | null | undefined,
  country: string | null | undefined,
): string {
  const n = unjamGeoLabel(name);
  const c = canonicalCountryLabel(country) || unjamGeoLabel(country);
  if (!n && !c) return "";
  if (!c) return n;
  if (!n) return c;
  return `${n} · ${c}`;
}

/** Fold text for search: strip accents (ü → u), case, and punctuation. */
function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Loose substring match for search inputs: ignores case, diacritics, apostrophes, and punctuation
 * so "nurburgring" matches "Nürburgring" and "Falcon's Flight" matches "Falcons Flight".
 */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const needle = foldSearchText(q);
  if (!needle) return false;
  return foldSearchText(haystack).includes(needle);
}
