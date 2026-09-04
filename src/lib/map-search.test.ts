import { describe, expect, it } from "vitest";

import { pickBestMapSearchHit, scoreMapSearchMatch } from "./map-search";

describe("scoreMapSearchMatch", () => {
  it("ranks exact matches highest", () => {
    expect(scoreMapSearchMatch("Icon", "Icon")).toBeGreaterThan(
      scoreMapSearchMatch("Iconic Coaster", "Icon"),
    );
  });

  it("ignores punctuation and diacritics", () => {
    expect(scoreMapSearchMatch("Nürburgring", "nurburgring")).toBeGreaterThan(0);
  });
});

describe("pickBestMapSearchHit", () => {
  const parks = [
    { id: 22, name: "Blackpool Pleasure Beach" },
    { id: 1, name: "Alton Towers" },
  ];
  const coasters = [
    { id: 1293, name: "Icon", park_id: 22 },
    { id: 33, name: "Big Dipper", park_id: 22 },
    { id: 100, name: "Nemesis", park_id: 1 },
  ];

  it("flies to a park when the query matches the park best", () => {
    expect(pickBestMapSearchHit({ query: "Blackpool", parks, coasters })).toEqual({
      kind: "park",
      parkId: 22,
      score: expect.any(Number),
      label: "Blackpool Pleasure Beach",
    });
  });

  it("flies to a coaster when the ride name is the stronger match", () => {
    expect(pickBestMapSearchHit({ query: "Icon", parks, coasters })).toEqual({
      kind: "coaster",
      coasterId: 1293,
      parkId: 22,
      score: expect.any(Number),
      label: "Icon",
    });
  });

  it("returns null when nothing matches", () => {
    expect(pickBestMapSearchHit({ query: "zzzz", parks, coasters })).toBeNull();
  });
});
