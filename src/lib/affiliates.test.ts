import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AffiliateAboutParagraph, AffiliatePrivacySection } from "@/components/affiliate-policy-copy";
import { PlanYourVisit } from "@/components/plan-your-visit";
import {
  AFFILIATE_DISCLOSURE,
  AFFILIATE_MAX_PARKS,
  AFFILIATE_PARK_LINKS,
  PLACEHOLDER_DESTINATION,
  type AffiliateEnv,
  resolveAffiliateLink,
} from "@/lib/affiliates";

const ALTON_TOWERS = 1;
const CEDAR_POINT_PLACEHOLDER = 2;
const SIX_FLAGS_ASTROWORLD = 61;
const UNMAPPED_PARK = 999_999;

const ORLANDO_PARK_IDS = [151, 284, 273, 191, 177, 169, 332];

const ENV_ON: AffiliateEnv = { enabled: true, getYourGuidePartnerId: "TESTID1" };

function stubAffiliateEnv(enabled: string) {
  vi.stubEnv("NEXT_PUBLIC_AFFILIATES_ENABLED", enabled);
  vi.stubEnv("NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID", "TESTID1");
}

function renderBox(parkId: number, parkIsDefunct = false): string {
  return renderToStaticMarkup(createElement(PlanYourVisit, { parkId, parkName: "Test Park", parkIsDefunct }));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAffiliateLink", () => {
  it("returns nothing while the flag is off, even with partner ids set", () => {
    expect(resolveAffiliateLink(ALTON_TOWERS, false, { ...ENV_ON, enabled: false })).toBeNull();
  });

  it("returns nothing for parks with no mapped link", () => {
    expect(resolveAffiliateLink(UNMAPPED_PARK, false, ENV_ON)).toBeNull();
  });

  it("returns nothing for placeholder destinations", () => {
    expect(AFFILIATE_PARK_LINKS[CEDAR_POINT_PLACEHOLDER].destination).toBe(PLACEHOLDER_DESTINATION);
    expect(resolveAffiliateLink(CEDAR_POINT_PLACEHOLDER, false, ENV_ON)).toBeNull();
  });

  it("returns nothing for defunct parks", () => {
    expect(resolveAffiliateLink(ALTON_TOWERS, true, ENV_ON)).toBeNull();
  });

  it("returns nothing when no partner id is configured", () => {
    expect(resolveAffiliateLink(ALTON_TOWERS, false, { enabled: true })).toBeNull();
    expect(resolveAffiliateLink(ALTON_TOWERS, false, { enabled: true, getYourGuidePartnerId: " " })).toBeNull();
  });

  it("adds the GetYourGuide partner id from env", () => {
    expect(resolveAffiliateLink(ALTON_TOWERS, false, ENV_ON)).toEqual({
      href: "https://www.getyourguide.com/alton-towers-l36405/?partner_id=TESTID1",
      partnerName: "GetYourGuide",
    });
  });
});

describe("AFFILIATE_PARK_LINKS", () => {
  const entries = Object.entries(AFFILIATE_PARK_LINKS).map(([id, link]) => ({ id: Number(id), ...link }));

  it("stays within the park limit and covers the seven Orlando parks", () => {
    expect(entries.length).toBeLessThanOrEqual(AFFILIATE_MAX_PARKS);
    for (const id of ORLANDO_PARK_IDS) {
      expect(resolveAffiliateLink(id, false, ENV_ON)).not.toBeNull();
    }
  });

  it("keeps partner ids and tracking out of code", () => {
    for (const { destination } of entries) {
      if (destination === PLACEHOLDER_DESTINATION) continue;
      const url = new URL(destination);
      expect(url.protocol).toBe("https:");
      expect(url.search).toBe("");
    }
  });

  it("every confirmed destination resolves when the env is complete", () => {
    for (const { id, destination } of entries) {
      expect(resolveAffiliateLink(id, false, ENV_ON) !== null).toBe(destination !== PLACEHOLDER_DESTINATION);
    }
  });

  it("skips a closed park the catalog does not flag as defunct", () => {
    expect(AFFILIATE_PARK_LINKS[SIX_FLAGS_ASTROWORLD]).toBeUndefined();
  });
});

describe("PlanYourVisit", () => {
  it("renders no HTML when the flag is off or the park has no link", () => {
    stubAffiliateEnv("false");
    expect(renderBox(ALTON_TOWERS)).toBe("");

    stubAffiliateEnv("true");
    expect(renderBox(UNMAPPED_PARK)).toBe("");
    expect(renderBox(CEDAR_POINT_PLACEHOLDER)).toBe("");
    expect(renderBox(ALTON_TOWERS, true)).toBe("");
  });

  it("shows the disclosure before a sponsored, new-tab link", () => {
    stubAffiliateEnv("true");
    const html = renderBox(ALTON_TOWERS);

    expect(html).toContain("Plan your visit");
    expect(html).toContain(AFFILIATE_DISCLOSURE);
    expect(html).toContain('rel="sponsored noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("<script");
    expect(html.indexOf(AFFILIATE_DISCLOSURE)).toBeLessThan(html.indexOf("<a "));
  });
});

describe("affiliate policy copy", () => {
  it("stays unpublished until the flag is on", () => {
    stubAffiliateEnv("false");
    expect(renderToStaticMarkup(createElement(AffiliatePrivacySection))).toBe("");
    expect(renderToStaticMarkup(createElement(AffiliateAboutParagraph))).toBe("");

    stubAffiliateEnv("true");
    expect(renderToStaticMarkup(createElement(AffiliatePrivacySection))).toContain("commission");
    expect(renderToStaticMarkup(createElement(AffiliateAboutParagraph))).toContain("commission");
  });
});

describe("box placement", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
    });
  }

  it("is only mounted on the park page, never on stats or logging screens", () => {
    const src = path.resolve(__dirname, "..");
    const importers = sourceFiles(src)
      .filter((file) => readFileSync(file, "utf8").includes("@/components/plan-your-visit"))
      .map((file) => path.relative(src, file).replaceAll("\\", "/"));

    expect(importers).toEqual(["app/parks/[slug]/page.tsx"]);
  });
});
