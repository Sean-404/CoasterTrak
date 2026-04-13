import { createServiceRoleClient } from "./lib/supabase-service";
import { fetchAllPages, SUPABASE_PAGE_SIZE } from "../src/lib/supabase-fetch-all";
import { isThrillCoaster } from "../src/lib/coaster-dedup";
import { effectiveCoasterType } from "../src/lib/wikidata-coaster-inference";
import { existsSync, readFileSync } from "node:fs";

type DbCoaster = {
  id: number;
  name: string;
  coaster_type: string | null;
  manufacturer: string | null;
  speed_mph: number | null;
  height_ft: number | null;
  length_ft: number | null;
  inversions: number | null;
  parks: { name: string } | null;
};

const THRILL_MANUFACTURER_HINTS = [
  "intamin",
  "bolliger",
  "mack",
  "vekoma",
  "rocky mountain",
  "premier rides",
  "gerstlauer",
  "arrow",
  "schwarzkopf",
  "gravity group",
  "great coasters international",
  "gci",
];

function hasThrillManufacturerHint(mfr: string | null): boolean {
  const t = (mfr ?? "").toLowerCase();
  if (!t) return false;
  return THRILL_MANUFACTURER_HINTS.some((h) => t.includes(h));
}

function hasFamilyCue(type: string | null, name: string): boolean {
  const t = (type ?? "").toLowerCase();
  const n = name.toLowerCase();
  return (
    /\b(family|kiddie|kiddy|junior|children|powered|wild mouse)\b/i.test(t) ||
    /\b(kiddie|kiddy|junior|children'?s|family)\b/i.test(n)
  );
}

function loadEnvLocalIfNeeded() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const envPath = ".env.local";
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocalIfNeeded();
  const supabase = createServiceRoleClient();
  const { data, error } = await fetchAllPages<DbCoaster>(SUPABASE_PAGE_SIZE, (from, to) =>
    supabase
      .from("coasters")
      .select(
        "id, name, coaster_type, manufacturer, speed_mph, height_ft, length_ft, inversions, parks(name)",
      )
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) {
    console.error(`Supabase error: ${error.message}`);
    process.exit(1);
  }

  let thrill = 0;
  let nonThrill = 0;
  let otherType = 0;
  let otherInferred = 0;
  let missingCoreStats = 0;
  const fastButNonThrill: string[] = [];
  const tallButNonThrill: string[] = [];
  const inferredExamples: string[] = [];
  const possibleMissedThrillModerate: string[] = [];
  const possibleMissedThrillByManufacturer: string[] = [];
  const unknownTypeNoFamilyCue: string[] = [];

  for (const c of data) {
    const type = c.coaster_type ?? "Unknown";
    const park = c.parks?.name ?? null;
    const classifyInput = {
      id: c.id,
      park_id: 0,
      name: c.name,
      coaster_type: type,
      manufacturer: c.manufacturer,
      status: "Operating",
      speed_mph: c.speed_mph,
      height_ft: c.height_ft,
      length_ft: c.length_ft,
      inversions: c.inversions,
      duration_s: null,
      opening_year: null,
      closing_year: null,
    };
    const isThrill = isThrillCoaster(classifyInput, park);
    if (isThrill) thrill += 1;
    else nonThrill += 1;

    if (type === "Other") {
      otherType += 1;
      const inferred = effectiveCoasterType(type, c.manufacturer);
      if (inferred !== "Unknown" && inferred !== "Other") {
        otherInferred += 1;
        if (inferredExamples.length < 20) {
          inferredExamples.push(`${c.name} @ ${park ?? "Unknown park"} => ${inferred}`);
        }
      }
    }

    if (!isThrill && (c.speed_mph ?? 0) >= 50 && fastButNonThrill.length < 20) {
      fastButNonThrill.push(`${c.name} @ ${park ?? "Unknown park"} (${c.speed_mph} mph)`);
    }
    if (!isThrill && (c.height_ft ?? 0) >= 120 && tallButNonThrill.length < 20) {
      tallButNonThrill.push(`${c.name} @ ${park ?? "Unknown park"} (${c.height_ft} ft)`);
    }
    if (
      c.speed_mph == null &&
      c.height_ft == null &&
      c.length_ft == null &&
      c.inversions == null
    ) {
      missingCoreStats += 1;
    }

    if (!isThrill) {
      const familyCue = hasFamilyCue(type, c.name);
      const typeUnknownish = !type || type === "Unknown" || type === "Other";
      const moderateSignal =
        (c.speed_mph ?? 0) >= 40 ||
        (c.height_ft ?? 0) >= 70 ||
        (c.length_ft ?? 0) >= 2200;
      if (moderateSignal && !familyCue && possibleMissedThrillModerate.length < 20) {
        possibleMissedThrillModerate.push(
          `${c.name} @ ${park ?? "Unknown park"} (type=${type || "Unknown"}, speed=${c.speed_mph ?? "?"}, height=${c.height_ft ?? "?"}, len=${c.length_ft ?? "?"}, inv=${c.inversions ?? "?"})`,
        );
      }
      if (hasThrillManufacturerHint(c.manufacturer) && !familyCue && possibleMissedThrillByManufacturer.length < 20) {
        possibleMissedThrillByManufacturer.push(
          `${c.name} @ ${park ?? "Unknown park"} (mfr=${c.manufacturer ?? "Unknown"}, type=${type || "Unknown"})`,
        );
      }
      if (typeUnknownish && !familyCue && unknownTypeNoFamilyCue.length < 20) {
        unknownTypeNoFamilyCue.push(
          `${c.name} @ ${park ?? "Unknown park"} (type=${type || "Unknown"}, mfr=${c.manufacturer ?? "Unknown"})`,
        );
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        total: data.length,
        thrill,
        nonThrill,
        percentThrill: data.length ? Math.round((thrill / data.length) * 1000) / 10 : 0,
        otherTypeRows: otherType,
        otherTypeInferredToSpecificType: otherInferred,
        rowsMissingCoreStats: missingCoreStats,
        samples: {
          inferredExamples,
          fastButNonThrill,
          tallButNonThrill,
          possibleMissedThrillModerate,
          possibleMissedThrillByManufacturer,
          unknownTypeNoFamilyCue,
        },
      },
      null,
      2,
    ),
  );
}

void main();
