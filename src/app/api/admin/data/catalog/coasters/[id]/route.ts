import { NextResponse } from "next/server";
import { isNextResponse, requireAdmin } from "@/lib/admin-api";
import { applyCoasterKnownFixes } from "@/lib/coaster-known-fixes";
import { coasterSlug, parkSlug } from "@/lib/slug";

export const runtime = "nodejs";

export type AdminCatalogCoasterOverride = {
  fieldName: string;
  valueInt: number | null;
  valueText: string | null;
  source: string | null;
  sourceUrl: string | null;
  approved: boolean | null;
};

export type AdminCatalogCoasterDetail = {
  coaster: {
    id: number;
    park_id: number;
    name: string;
    coaster_type: string | null;
    manufacturer: string | null;
    status: string | null;
    wikidata_id: string | null;
    rcdb_id: string | null;
    external_source: string | null;
    external_id: string | null;
    image_url: string | null;
    height_ft: number | null;
    speed_mph: number | null;
    length_ft: number | null;
    duration_s: number | null;
    inversions: number | null;
    opening_year: number | null;
    closing_year: number | null;
    enwiki_title: string | null;
    summary_text: string | null;
    last_synced_at: string | null;
  };
  display: {
    name: string;
    manufacturer: string | null;
    status: string | null;
    coasterType: string | null;
    heightFt: number | null;
    speedMph: number | null;
    lengthFt: number | null;
    openingYear: number | null;
    closingYear: number | null;
    imageUrl: string | null;
  };
  park: {
    id: number;
    name: string;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    external_id: string | null;
    external_source: string | null;
  } | null;
  overrides: AdminCatalogCoasterOverride[];
  knownFixApplied: boolean;
  publicPath: string;
  parkPublicPath: string | null;
  wikidataUrl: string | null;
  wikipediaUrl: string | null;
  missingFields: string[];
};

function missingFieldsFor(row: AdminCatalogCoasterDetail["coaster"]): string[] {
  const missing: string[] = [];
  if (row.height_ft == null) missing.push("height");
  if (row.speed_mph == null) missing.push("speed");
  if (row.length_ft == null) missing.push("length");
  if (!row.manufacturer?.trim()) missing.push("manufacturer");
  if (!row.image_url?.trim()) missing.push("image");
  if (row.opening_year == null) missing.push("opening_year");
  return missing;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(request);
  if (isNextResponse(ctx)) return ctx;

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid coaster id." }, { status: 400 });
  }

  const [coasterRes, overridesRes] = await Promise.all([
    ctx.service
      .from("coasters")
      .select(
        "id,park_id,name,coaster_type,manufacturer,status,wikidata_id,rcdb_id,external_source,external_id,image_url,height_ft,speed_mph,length_ft,duration_s,inversions,opening_year,closing_year,enwiki_title,summary_text,last_synced_at,parks(id,name,country,latitude,longitude,external_id,external_source)",
      )
      .eq("id", id)
      .maybeSingle(),
    ctx.service
      .from("data_coaster_field_overrides")
      .select("field_name,value_int,value_text,source,source_url,approved")
      .eq("coaster_id", id)
      .order("field_name", { ascending: true }),
  ]);

  if (coasterRes.error) {
    return NextResponse.json({ error: coasterRes.error.message }, { status: 500 });
  }
  if (!coasterRes.data) {
    return NextResponse.json({ error: "Coaster not found." }, { status: 404 });
  }

  const row = coasterRes.data as {
    id: number;
    park_id: number;
    name: string;
    coaster_type: string | null;
    manufacturer: string | null;
    status: string | null;
    wikidata_id: string | null;
    rcdb_id: string | null;
    external_source: string | null;
    external_id: string | null;
    image_url: string | null;
    height_ft: number | null;
    speed_mph: number | null;
    length_ft: number | null;
    duration_s: number | null;
    inversions: number | null;
    opening_year: number | null;
    closing_year: number | null;
    enwiki_title: string | null;
    summary_text: string | null;
    last_synced_at: string | null;
    parks:
      | {
          id: number;
          name: string;
          country: string | null;
          latitude: number | null;
          longitude: number | null;
          external_id: string | null;
          external_source: string | null;
        }
      | {
          id: number;
          name: string;
          country: string | null;
          latitude: number | null;
          longitude: number | null;
          external_id: string | null;
          external_source: string | null;
        }[]
      | null;
  };

  const parkRaw = Array.isArray(row.parks) ? row.parks[0] ?? null : row.parks;
  const fixed = applyCoasterKnownFixes({
    name: row.name,
    wikidata_id: row.wikidata_id,
    manufacturer: row.manufacturer,
    status: row.status ?? undefined,
    coaster_type: row.coaster_type ?? undefined,
    image_url: row.image_url,
    height_ft: row.height_ft,
    speed_mph: row.speed_mph,
    length_ft: row.length_ft,
    duration_s: row.duration_s,
    inversions: row.inversions,
    opening_year: row.opening_year,
    closing_year: row.closing_year,
  });

  const knownFixApplied =
    fixed.name !== row.name ||
    (fixed.manufacturer ?? null) !== (row.manufacturer ?? null) ||
    (fixed.status ?? null) !== (row.status ?? null) ||
    (fixed.coaster_type ?? null) !== (row.coaster_type ?? null) ||
    (fixed.image_url ?? null) !== (row.image_url ?? null) ||
    (fixed.height_ft ?? null) !== (row.height_ft ?? null) ||
    (fixed.speed_mph ?? null) !== (row.speed_mph ?? null) ||
    (fixed.length_ft ?? null) !== (row.length_ft ?? null) ||
    (fixed.opening_year ?? null) !== (row.opening_year ?? null) ||
    (fixed.closing_year ?? null) !== (row.closing_year ?? null);

  const overrides: AdminCatalogCoasterOverride[] = (overridesRes.data ?? []).map((o) => ({
    fieldName: String(o.field_name),
    valueInt: typeof o.value_int === "number" ? o.value_int : null,
    valueText: typeof o.value_text === "string" ? o.value_text : null,
    source: typeof o.source === "string" ? o.source : null,
    sourceUrl: typeof o.source_url === "string" ? o.source_url : null,
    approved: typeof o.approved === "boolean" ? o.approved : null,
  }));

  const displayName = fixed.name.trim() || row.name;
  const wikidataId = row.wikidata_id?.trim() || null;
  const enwiki = row.enwiki_title?.trim() || null;

  const payload: AdminCatalogCoasterDetail = {
    coaster: {
      id: row.id,
      park_id: row.park_id,
      name: row.name,
      coaster_type: row.coaster_type,
      manufacturer: row.manufacturer,
      status: row.status,
      wikidata_id: row.wikidata_id,
      rcdb_id: row.rcdb_id,
      external_source: row.external_source,
      external_id: row.external_id,
      image_url: row.image_url,
      height_ft: row.height_ft,
      speed_mph: row.speed_mph,
      length_ft: row.length_ft,
      duration_s: row.duration_s,
      inversions: row.inversions,
      opening_year: row.opening_year,
      closing_year: row.closing_year,
      enwiki_title: row.enwiki_title,
      summary_text: row.summary_text,
      last_synced_at: row.last_synced_at,
    },
    display: {
      name: displayName,
      manufacturer: fixed.manufacturer ?? row.manufacturer,
      status: fixed.status ?? row.status,
      coasterType: fixed.coaster_type ?? row.coaster_type,
      heightFt: fixed.height_ft ?? row.height_ft,
      speedMph: fixed.speed_mph ?? row.speed_mph,
      lengthFt: fixed.length_ft ?? row.length_ft,
      openingYear: fixed.opening_year ?? row.opening_year,
      closingYear: fixed.closing_year ?? row.closing_year,
      imageUrl: fixed.image_url ?? row.image_url,
    },
    park: parkRaw
      ? {
          id: parkRaw.id,
          name: parkRaw.name,
          country: parkRaw.country,
          latitude: parkRaw.latitude,
          longitude: parkRaw.longitude,
          external_id: parkRaw.external_id,
          external_source: parkRaw.external_source,
        }
      : null,
    overrides,
    knownFixApplied,
    publicPath: `/coasters/${coasterSlug(displayName, row.id)}`,
    parkPublicPath: parkRaw ? `/parks/${parkSlug(parkRaw.name, parkRaw.id)}` : null,
    wikidataUrl: wikidataId ? `https://www.wikidata.org/wiki/${wikidataId}` : null,
    wikipediaUrl: enwiki
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(enwiki.replace(/ /g, "_"))}`
      : null,
    missingFields: missingFieldsFor(row),
  };

  return NextResponse.json(payload);
}
