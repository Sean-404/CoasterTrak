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

  it("names the Plopsaland Ardennes Gerstlauer Wickie The Ride", () => {
    const fixed = applyCoasterKnownFixes({
      name: "Q122460556",
      wikidata_id: "Q122460556",
    });
    expect(fixed.name).toBe("Wickie The Ride");
  });

  it("fills #LikeMe Coaster stats from the official Plopsaland page", () => {
    const fixed = applyCoasterKnownFixes({
      name: "#LikeMe Coaster",
      manufacturer: undefined,
      height_ft: undefined,
      speed_mph: undefined,
      length_ft: undefined,
      duration_s: undefined,
      inversions: undefined,
    });
    expect(fixed.manufacturer).toBe("Zierer");
    expect(fixed.height_ft).toBe(26);
    expect(fixed.speed_mph).toBe(22);
    expect(fixed.length_ft).toBe(1181);
    expect(fixed.duration_s).toBe(80);
    expect(fixed.inversions).toBe(0);
  });
});

describe("shouldSkipWikidataCoasterId", () => {
  it("skips the Battersea funfair disaster item", () => {
    expect(shouldSkipWikidataCoasterId("Q22000267")).toBe(true);
  });
});
