import { describe, expect, it } from "vitest";
import { WIKIDATA_LABEL_LANGUAGES } from "./wikidata-coasters";

describe("WIKIDATA_LABEL_LANGUAGES", () => {
  it("keeps English and mul first, then covers EN-sparse coaster regions", () => {
    const langs = WIKIDATA_LABEL_LANGUAGES.split(",");
    expect(langs.slice(0, 3)).toEqual(["en", "mul", "en-gb"]);
    for (const needed of ["pl", "cs", "hu", "sv", "ko", "ru"]) {
      expect(langs).toContain(needed);
    }
  });
});
