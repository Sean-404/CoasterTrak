import { describe, expect, it } from "vitest";
import {
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
  it("allows friends or public", () => {
    expect(isStatsVisibility("friends")).toBe(true);
    expect(isStatsVisibility("public")).toBe(true);
    expect(isStatsVisibility("private")).toBe(false);
    expect(isStatsVisibility("")).toBe(false);
  });
});

describe("friendlyRidePhotoError", () => {
  it("maps storage policy failures", () => {
    expect(friendlyRidePhotoError("new row violates row-level security policy")).toMatch(/sign in/i);
  });
});
