import { describe, expect, it } from "vitest";
import { distanceKm, findNearestPark, formatDistance, isAtPark } from "@/lib/nearby-park";

const ALTON_TOWERS = { id: 1, name: "Alton Towers", latitude: 52.9874, longitude: -1.8865 };
const THORPE_PARK = { id: 98, name: "Thorpe Park", latitude: 51.4036, longitude: -0.5137 };
const NO_PIN = { id: 5, name: "Unknown park", latitude: null, longitude: null };

describe("distanceKm", () => {
  it("measures roughly the real distance between two parks", () => {
    const d = distanceKm(
      { lat: ALTON_TOWERS.latitude, lng: ALTON_TOWERS.longitude },
      { lat: THORPE_PARK.latitude, lng: THORPE_PARK.longitude },
    );
    expect(d).toBeGreaterThan(195);
    expect(d).toBeLessThan(205);
  });
});

describe("findNearestPark", () => {
  it("picks the closest park and skips parks without a pin", () => {
    // In the Alton Towers car park, about 1 km from the pin.
    const nearest = findNearestPark([NO_PIN, THORPE_PARK, ALTON_TOWERS], { lat: 52.9925, lng: -1.8995 });
    expect(nearest?.park.name).toBe("Alton Towers");
    expect(isAtPark(nearest)).toBe(true);
  });

  it("reports a nearby park without claiming you are at it", () => {
    // Stoke-on-Trent, about 18 km away.
    const nearest = findNearestPark([ALTON_TOWERS, THORPE_PARK], { lat: 53.0027, lng: -2.1794 });
    expect(nearest?.park.name).toBe("Alton Towers");
    expect(isAtPark(nearest)).toBe(false);
  });

  it("returns null when every park is far away", () => {
    expect(findNearestPark([ALTON_TOWERS], { lat: 40.7128, lng: -74.006 })).toBeNull();
    expect(findNearestPark([], { lat: 0, lng: 0 })).toBeNull();
  });
});

describe("formatDistance", () => {
  it("uses metres under a kilometre and km above", () => {
    expect(formatDistance(0.43)).toBe("450 m");
    expect(formatDistance(0.01)).toBe("50 m");
    expect(formatDistance(3.24)).toBe("3.2 km");
    expect(formatDistance(18.6)).toBe("19 km");
  });
});
