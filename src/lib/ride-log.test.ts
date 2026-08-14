import { describe, expect, it } from "vitest";
import { friendlyLogError } from "./ride-log";

describe("friendlyLogError", () => {
  it("does not treat a missing RPC (p_quantity in the message) as a quantity validation error", () => {
    expect(
      friendlyLogError(
        "Could not find the function public.log_ride_events(p_coaster_id, p_ridden_on, p_quantity) in the schema cache",
      ),
    ).toBe("Ride history is not available yet. Apply the latest database update and try again.");
  });

  it("still maps real quantity constraint failures", () => {
    expect(friendlyLogError("quantity must be between 1 and 99")).toBe(
      "Enter a whole number of rides between 1 and 99.",
    );
    expect(
      friendlyLogError('new row for relation "ride_events" violates check constraint "ride_events_quantity_range"'),
    ).toBe("Enter a whole number of rides between 1 and 99.");
  });

  it("maps unique-constraint failures without using the quantity copy", () => {
    expect(
      friendlyLogError(
        'duplicate key value violates unique constraint "ride_events_user_coaster_dated_uidx"',
      ),
    ).toContain("duplicate key");
  });

  it("maps missing ride-day adjustments", () => {
    expect(friendlyLogError("No rides logged for this date")).toBe("No rides logged for that day.");
  });
});
