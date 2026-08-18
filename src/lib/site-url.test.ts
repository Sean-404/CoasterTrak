import { describe, expect, it } from "vitest";
import { AUTH_ORIGIN, PASSWORD_RESET_HREF, SITE_URL, siteHref } from "./site-url";

describe("site-url", () => {
  it("builds canonical auth paths on the public domain", () => {
    expect(PASSWORD_RESET_HREF).toBe("https://coastertrak.com/reset-password");
    expect(siteHref("/stats", AUTH_ORIGIN)).toBe("https://coastertrak.com/stats");
    expect(siteHref("/reset-password")).toBe(`${SITE_URL}/reset-password`);
  });
});
