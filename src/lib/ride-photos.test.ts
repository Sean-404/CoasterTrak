import { describe, expect, it } from "vitest";
import {
  canViewOtherUserStats,
  friendlyRidePhotoError,
  isStatsVisibility,
  parseRidePhotoPath,
  ridePhotoObjectPath,
} from "./ride-photos";

const USER = "11111111-1111-4111-8111-111111111111";

describe("ridePhotoObjectPath", () => {
  it("stores one jpeg per user and coaster", () => {
    expect(ridePhotoObjectPath(USER, 511)).toBe(`${USER}/511.jpg`);
  });
});

describe("parseRidePhotoPath", () => {
  it("accepts the owner path format", () => {
    expect(parseRidePhotoPath(`${USER}/15590.jpg`)).toEqual({ userId: USER, coasterId: 15590 });
  });

  it("rejects other paths", () => {
    expect(parseRidePhotoPath(null)).toBeNull();
    expect(parseRidePhotoPath("")).toBeNull();
    expect(parseRidePhotoPath(`${USER}/511.png`)).toBeNull();
    expect(parseRidePhotoPath(`not-a-uuid/511.jpg`)).toBeNull();
    expect(parseRidePhotoPath(`${USER}/../511.jpg`)).toBeNull();
    expect(parseRidePhotoPath(`${USER}/511.jpg/extra`)).toBeNull();
  });
});

describe("isStatsVisibility", () => {
  it("allows private, friends, or public", () => {
    expect(isStatsVisibility("private")).toBe(true);
    expect(isStatsVisibility("friends")).toBe(true);
    expect(isStatsVisibility("public")).toBe(true);
    expect(isStatsVisibility("")).toBe(false);
  });
});

describe("canViewOtherUserStats", () => {
  it("hides private stats from everyone else", () => {
    expect(canViewOtherUserStats("private", false)).toBe(false);
    expect(canViewOtherUserStats("private", true)).toBe(false);
  });

  it("shows friends-only stats to accepted friends", () => {
    expect(canViewOtherUserStats("friends", false)).toBe(false);
    expect(canViewOtherUserStats("friends", true)).toBe(true);
  });

  it("shows public stats to any signed-in user", () => {
    expect(canViewOtherUserStats("public", false)).toBe(true);
    expect(canViewOtherUserStats("public", true)).toBe(true);
  });
});

describe("friendlyRidePhotoError", () => {
  it("maps storage policy failures", () => {
    expect(friendlyRidePhotoError("new row violates row-level security policy")).toMatch(/sign in/i);
  });
});
