import { describe, expect, it } from "vitest";
import {
  invitePath,
  profileOrStatsPath,
  publicProfileHref,
  publicProfilePath,
} from "@/lib/public-profile";

describe("public profile URLs", () => {
  it("encodes display names for /u paths", () => {
    expect(publicProfilePath("Sheen404")).toBe("/u/Sheen404");
    expect(publicProfilePath("Foo Bar")).toBe("/u/Foo%20Bar");
    expect(publicProfileHref("Foo Bar", "https://coastertrak.com")).toBe(
      "https://coastertrak.com/u/Foo%20Bar",
    );
  });

  it("builds invite paths from user ids", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(invitePath(id)).toBe(`/invite/${id}`);
  });

  it("prefers /u for public profiles and stats otherwise", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(profileOrStatsPath("Sheen404", id, "public")).toBe("/u/Sheen404");
    expect(profileOrStatsPath("Sheen404", id, "friends")).toBe(`/stats?user=${id}`);
    expect(profileOrStatsPath(null, id, "public")).toBe(`/stats?user=${id}`);
  });
});
