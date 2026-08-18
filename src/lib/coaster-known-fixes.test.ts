import { describe, expect, it } from "vitest";
import {
  applyCoasterKnownFixes,
  isLikelyIncidentImageUrl,
  sanitizeCoasterImageUrl,
  shouldSkipWikidataCoasterId,
} from "./coaster-known-fixes";

const BATTERSEA_INCIDENT =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Battersea_Fun_Fair_and_Big_Dipper_%28ride%29_before_the_Incident.jpg/3840px-Battersea_Fun_Fair_and_Big_Dipper_%28ride%29_before_the_Incident.jpg";

describe("isLikelyIncidentImageUrl", () => {
  it("catches incident tokens after underscores", () => {
    expect(isLikelyIncidentImageUrl(BATTERSEA_INCIDENT)).toBe(true);
  });

  it("keeps Disaster Transport's Cedar Point photo", () => {
    expect(
      isLikelyIncidentImageUrl(
        "https://upload.wikimedia.org/wikipedia/commons/5/51/Disaster_Transport_Cedar_Point.JPG",
      ),
    ).toBe(false);
  });
});

describe("sanitizeCoasterImageUrl", () => {
  it("drops the Battersea incident photo", () => {
    expect(sanitizeCoasterImageUrl(BATTERSEA_INCIDENT)).toBeNull();
  });
});

describe("applyCoasterKnownFixes", () => {
  it("uses the Blackpool Big Dipper photo instead of Battersea", () => {
    const fixed = applyCoasterKnownFixes({
      name: "Big Dipper",
      wikidata_id: "Q265733",
      image_url: BATTERSEA_INCIDENT,
    });
    expect(fixed.image_url).toContain("Blackpool");
    expect(fixed.image_url).not.toMatch(/incident/i);
  });
});

describe("shouldSkipWikidataCoasterId", () => {
  it("skips the Battersea funfair disaster item", () => {
    expect(shouldSkipWikidataCoasterId("Q22000267")).toBe(true);
  });
});
