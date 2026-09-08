import { describe, expect, it } from "vitest";
import {
  buildGuessCandidates,
  formatGuessDistance,
  guessDistanceLabel,
  guessScoreFromKm,
  isGuessPoolCoaster,
  isUsefulGuessPhotoUrl,
  pickGuessCandidate,
  toGuessCandidate,
} from "./guess-round";
import type { Coaster, Park } from "@/types/domain";

function coaster(overrides: Partial<Coaster> = {}): Coaster {
  return {
    id: 1,
    park_id: 10,
    name: "Nemesis",
    coaster_type: "Steel",
    status: "Operating",
    height_ft: 43,
    image_url: "https://upload.wikimedia.org/wikipedia/commons/a/a.jpg",
    ...overrides,
  };
}

function park(overrides: Partial<Park> = {}): Park {
  return {
    id: 10,
    name: "Alton Towers",
    country: "United Kingdom",
    latitude: 52.987,
    longitude: -1.89,
    ...overrides,
  };
}

describe("toGuessCandidate", () => {
  it("keeps a coaster that already has a photo and a real park pin", () => {
    expect(toGuessCandidate(coaster(), park())).toMatchObject({
      coasterId: 1,
      coasterName: "Nemesis",
      parkName: "Alton Towers",
    });
  });

  it("skips ferris wheels and other non-coasters", () => {
    expect(
      isGuessPoolCoaster(
        coaster({
          name: "Cosmo Clock 21",
          coaster_type: "Ferris wheel",
          height_ft: 369,
        }),
      ),
    ).toBe(false);
    expect(isGuessPoolCoaster(coaster({ name: "Nemesis", coaster_type: "Steel" }))).toBe(true);
  });

  it("skips logos and title signs", () => {
    expect(
      isUsefulGuessPhotoUrl(
        "https://upload.wikimedia.org/wikipedia/en/a/a4/Big_Dipper_2021_logo%2C_Luna_Park_Sydney.png",
      ),
    ).toBe(false);
    expect(
      toGuessCandidate(
        coaster({
          name: "Big Dipper",
          image_url: "https://upload.wikimedia.org/wikipedia/commons/a/a/Big_Dipper_sign.jpg",
        }),
        park(),
      ),
    ).toBeNull();
    expect(
      isUsefulGuessPhotoUrl("https://upload.wikimedia.org/wikipedia/commons/1/1/Nemesis_Alton_Towers.jpg"),
    ).toBe(true);
  });

  it("skips rides with no photo", () => {
    expect(toGuessCandidate(coaster({ image_url: null }), park())).toBeNull();
    expect(toGuessCandidate(coaster({ image_url: "  " }), park())).toBeNull();
  });

  it("skips parks without usable coordinates", () => {
    expect(toGuessCandidate(coaster(), park({ latitude: 0, longitude: 0 }))).toBeNull();
    expect(toGuessCandidate(coaster(), park({ name: "Unknown" }))).toBeNull();
  });
});

describe("pickGuessCandidate", () => {
  const pool = buildGuessCandidates(
    [coaster({ id: 1 }), coaster({ id: 2, name: "Oblivion" })],
    [park()],
  );

  it("avoids the previous ride when another photo is available", () => {
    const picked = pickGuessCandidate(pool, { avoidCoasterId: 1, random: () => 0 });
    expect(picked?.coasterId).toBe(2);
  });
});

describe("guess scoring", () => {
  it("scores a park pin higher than a continent miss", () => {
    expect(guessScoreFromKm(8)).toBeGreaterThan(guessScoreFromKm(2000));
    expect(guessDistanceLabel(12)).toBe("On the park");
    expect(guessDistanceLabel(3000)).toBe("Long way off");
    expect(formatGuessDistance(0.4)).toBe("Under 1 km");
  });
});
