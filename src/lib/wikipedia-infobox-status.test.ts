import { describe, expect, it } from "vitest";
import { inferStatusFromText } from "./wikipedia-infobox";

describe("inferStatusFromText", () => {
  it("treats relocated-to / permanently closed as defunct", () => {
    expect(inferStatusFromText("Relocated to Hopi Hari")).toBe("defunct");
    expect(inferStatusFromText("Permanently closed")).toBe("defunct");
    expect(inferStatusFromText("Removed")).toBe("defunct");
  });

  it("treats operating and relocated-from as operating", () => {
    expect(inferStatusFromText("Operating")).toBe("operating");
    expect(inferStatusFromText("Relocated from Alton Towers")).toBe("operating");
  });
});
