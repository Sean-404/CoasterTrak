import { describe, expect, it } from "vitest";

import { ENSURE_COASTER_INSTALLS } from "@/lib/catalog-overrides";
import {
  buildExtraInstallPatch,
  coasterMatchesInstallName,
  findParkIdForInstall,
  planDiscoveredInfoboxInstalls,
  planEnsureCoasterInstalls,
} from "@/lib/catalog-extra-installs";
import { parseInfoboxCoasterLocationsFromWikitext } from "@/lib/wikipedia-infobox-coaster";

describe("planEnsureCoasterInstalls", () => {
  const parks = [
    { id: 88, name: "Six Flags Darien Lake", country: "United States", latitude: 0, longitude: 0 },
    { id: 17, name: "Six Flags America", country: "United States", latitude: 0, longitude: 0 },
    { id: 65, name: "Six Flags St. Louis", country: "United States", latitude: 0, longitude: 0 },
  ];

  it("inserts Darien Lake Ride of Steel when only SFA has the Wikidata row", () => {
    const plans = planEnsureCoasterInstalls({
      parks,
      coasters: [
        {
          id: 511,
          park_id: 17,
          name: "Ride of Steel",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: "Intamin",
          opening_year: 2000,
          closing_year: 2025,
          height_ft: 208,
          speed_mph: 73,
          length_ft: 5400,
          inversions: 0,
          duration_s: null,
          rcdb_id: "699",
          enwiki_title: "Ride of Steel",
        },
      ],
      specs: ENSURE_COASTER_INSTALLS.filter((s) => s.name === "Ride of Steel"),
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      action: "insert",
      parkId: 88,
      spec: { name: "Ride of Steel", status: "Operating", rcdb_id: "541" },
    });
  });

  it("does not share the SFA Wikidata id onto the Darien Lake sibling", () => {
    const plans = planEnsureCoasterInstalls({
      parks,
      coasters: [],
      specs: ENSURE_COASTER_INSTALLS.filter((s) => s.name === "Ride of Steel"),
    });
    expect(plans[0]?.action).toBe("insert");
    if (plans[0]?.action === "insert") {
      expect("wikidata_id" in plans[0].spec).toBe(false);
    }
  });

  it("patches a defunct same-name clone back to operating", () => {
    const spec = ENSURE_COASTER_INSTALLS.find((s) => s.parkName === "Six Flags Darien Lake")!;
    const patch = buildExtraInstallPatch(
      {
        id: 9,
        park_id: 88,
        name: "Superman – Ride of Steel",
        status: "Defunct",
        coaster_type: "Steel",
        manufacturer: "Intamin",
        opening_year: 1999,
        closing_year: 2025,
        height_ft: 208,
        speed_mph: 73,
        length_ft: 5400,
        inversions: 0,
        duration_s: 122,
        rcdb_id: "541",
        enwiki_title: "Ride of Steel",
      },
      spec,
    );
    expect(patch).toMatchObject({ name: "Ride of Steel", status: "Operating", closing_year: null });
  });

  it("matches Mid America Adventure to Six Flags St. Louis", () => {
    expect(
      findParkIdForInstall(parks, {
        parkName: "Six Flags St. Louis",
        parkNameAliases: ["Mid America Adventure"],
        name: "Mr. Freeze",
        coaster_type: "Steel",
        status: "Operating",
      }),
    ).toBe(65);
  });

  it("treats Superman Ride of Steel as the same Darien Lake credit", () => {
    const spec = ENSURE_COASTER_INSTALLS.find((s) => s.parkName === "Six Flags Darien Lake")!;
    expect(coasterMatchesInstallName("Superman: Ride of Steel", spec)).toBe(true);
  });

  it("plans Tokyo Joypolis Gekion Live Coaster when the park and ride are missing", () => {
    const plans = planEnsureCoasterInstalls({
      parks: [{ id: 900, name: "Tokyo Joypolis" }],
      coasters: [],
      specs: ENSURE_COASTER_INSTALLS.filter((s) => s.name === "Gekion Live Coaster"),
    });

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      action: "insert",
      parkId: 900,
      spec: {
        name: "Gekion Live Coaster",
        status: "Operating",
        rcdb_id: "6453",
        manufacturer: "Gerstlauer",
      },
    });
  });

  it("does not re-apply prior-life closing years from Wikipedia extend specs", () => {
    const patch = buildExtraInstallPatch(
      {
        id: 228,
        park_id: 1,
        name: "Freestyle",
        status: "Defunct",
        coaster_type: "Steel",
        manufacturer: "TOGO",
        opening_year: 2015,
        closing_year: 2014,
        height_ft: null,
        speed_mph: null,
        length_ft: null,
        inversions: null,
        duration_s: null,
        rcdb_id: null,
        enwiki_title: null,
      },
      {
        parkName: "Canada's Wonderland",
        name: "Freestyle (roller coaster)",
        coaster_type: "Steel",
        status: "Defunct",
        opening_year: 2015,
        closing_year: 2014,
      },
    );
    expect(patch).toMatchObject({
      name: "Freestyle (roller coaster)",
      status: "Operating",
      closing_year: null,
    });
  });
});

describe("planDiscoveredInfoboxInstalls", () => {
  it("inserts Wikipedia /extend parks that the unique Wikidata row missed", () => {
    const wt = `
{{Infobox roller coaster
|name=Ride of Steel
|location=Six Flags America
|opened={{Start date|2000|05|13}}
|status=Closed
|closed={{Start date|2025|11|02}}
|rcdb_number=699
|extend={{Infobox roller coaster/extend
|location=Six Flags Darien Lake
|opened={{Start date|1999|05|15}}
|status=Operating
|rcdb_number=541
}}
}}
`;
    const plans = planDiscoveredInfoboxInstalls({
      parks: [
        { id: 88, name: "Six Flags Darien Lake" },
        { id: 17, name: "Six Flags America" },
      ],
      coasters: [
        {
          id: 511,
          park_id: 17,
          name: "Ride of Steel",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: "Intamin",
          opening_year: 2000,
          closing_year: 2025,
          rcdb_id: "699",
          enwiki_title: "Ride of Steel",
        },
      ],
      articleTitle: "Ride of Steel",
      locations: parseInfoboxCoasterLocationsFromWikitext(wt),
    });

    const inserts = plans.filter((p) => p.action === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      action: "insert",
      parkId: 88,
      spec: {
        name: "Ride of Steel",
        status: "Operating",
        rcdb_id: "541",
      },
    });
  });

  it("does not insert Superman – Ride of Steel beside an existing Ride of Steel row", () => {
    const plans = planDiscoveredInfoboxInstalls({
      parks: [
        { id: 88, name: "Six Flags Darien Lake" },
        { id: 17, name: "Six Flags America" },
      ],
      coasters: [
        {
          id: 511,
          park_id: 17,
          name: "Ride of Steel",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: "Intamin",
          opening_year: 2000,
          closing_year: 2025,
          rcdb_id: "699",
          enwiki_title: "Ride of Steel",
        },
        {
          id: 15749,
          park_id: 88,
          name: "Ride of Steel",
          status: "Operating",
          coaster_type: "Steel",
          manufacturer: "Intamin",
          opening_year: 1999,
          rcdb_id: "541",
          enwiki_title: "Ride of Steel",
        },
      ],
      articleTitle: "Ride of Steel",
      locations: [
        { parkName: "Six Flags America", name: "Superman – Ride of Steel", status: "Defunct", opening_year: 2000, rcdb_id: "699" },
        { parkName: "Six Flags Darien Lake", name: "Superman – Ride of Steel", status: "Operating", opening_year: 1999, rcdb_id: "541" },
      ],
    });

    expect(plans.filter((p) => p.action === "insert")).toHaveLength(0);
    expect(plans.some((p) => p.action === "patch" && p.patch.name)).toBe(false);
  });

  it("does not put Garuda Glide on a Wonderland park or rename T2 onto an existing Garuda Glide", () => {
    const parks = [
      { id: 87, name: "Canada's Wonderland" },
      { id: 121, name: "Kentucky Kingdom" },
      { id: 129, name: "Dutch Wonderland" },
    ];
    expect(
      findParkIdForInstall(parks, {
        parkName: "Wonderla",
        name: "Garuda Glide",
        coaster_type: "Steel",
        status: "Operating",
      }),
    ).toBeNull();

    const plans = planDiscoveredInfoboxInstalls({
      parks,
      coasters: [
        {
          id: 391,
          park_id: 121,
          name: "T2",
          status: "Operating",
          coaster_type: "Steel",
          manufacturer: "Vekoma",
          opening_year: 1995,
          rcdb_id: null,
          enwiki_title: "Garuda Glide",
        },
        {
          id: 1194,
          park_id: 121,
          name: "Garuda Glide",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: "Intamin",
          opening_year: 2026,
          rcdb_id: null,
          enwiki_title: "Garuda Glide",
        },
      ],
      articleTitle: "Garuda Glide",
      locations: [
        { parkName: "Kentucky Kingdom", name: "Garuda Glide", status: "Operating", opening_year: 2026 },
        { parkName: "Wonderla", name: "Garuda Glide", status: "Operating", opening_year: 2026, rcdb_id: "22601" },
      ],
    });

    expect(plans.filter((p) => p.action === "insert")).toHaveLength(0);
    const kkPatch = plans.find((p) => p.action === "patch" && p.coasterId === 1194);
    expect(kkPatch?.action === "patch" ? kkPatch.patch.name : undefined).toBeUndefined();
    expect(plans.some((p) => p.action === "patch" && p.coasterId === 391)).toBe(false);
  });

  it("does not reassign an RCDB id already owned at the park (Goliath / Chupacabra)", () => {
    const wt = `
{{Infobox roller coaster
| name = Goliath
| extend = {{Infobox roller coaster extend
| name = Déjà Vu
| location = Six Flags Magic Mountain
| status = Relocated to Six Flags New England
| opened = {{Start date|2001|08|25}}
| closed = {{End date|2011|10|16}}
| rcdb_number = 748
}}
| location = Six Flags New England
| status = Removed
| opened = {{Start date|2012|05|25}}
| closed = {{End date|2019}}
| rcdb_number = 10138
}}
`;
    const plans = planDiscoveredInfoboxInstalls({
      parks: [
        { id: 43, name: "Six Flags New England" },
        { id: 64, name: "Six Flags Magic Mountain" },
      ],
      coasters: [
        {
          id: 15803,
          park_id: 43,
          name: "Goliath (Six Flags New England)",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: "Vekoma",
          opening_year: 2012,
          closing_year: 2019,
          rcdb_id: "10138",
          enwiki_title: "Goliath (Six Flags New England)",
        },
        {
          id: 536,
          park_id: 64,
          name: "Chupacabra",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: "Vekoma",
          opening_year: 2012,
          closing_year: null,
          rcdb_id: "748",
          enwiki_title: null,
        },
        {
          id: 15883,
          park_id: 64,
          name: "Goliath",
          status: "Defunct",
          coaster_type: "Steel",
          manufacturer: null,
          opening_year: 2001,
          closing_year: 2011,
          rcdb_id: null,
          enwiki_title: "Goliath (Six Flags New England)",
        },
      ],
      articleTitle: "Goliath (Six Flags New England)",
      locations: parseInfoboxCoasterLocationsFromWikitext(wt),
    });

    expect(plans.some((p) => p.action === "patch" && p.patch.rcdb_id === "748")).toBe(false);
    expect(plans.some((p) => p.action === "patch" && p.coasterId === 15883 && p.patch.rcdb_id)).toBe(
      false,
    );
    // Mislabelled row that already owns RCDB 748 must not be renamed from the SFNE article.
    expect(plans.some((p) => p.action === "patch" && p.coasterId === 536)).toBe(false);
  });
});
