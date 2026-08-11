import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatPageFileName,
  newRunId,
  wikidataProcessedRunDir,
  wikidataRawRunDir,
  wikidataReportDir,
} from "@/lib/coastertrak-data/paths";

describe("coastertrak-data paths", () => {
  it("builds stable run folder paths", () => {
    expect(wikidataRawRunDir("run-1")).toBe(join("data", "raw", "wikidata", "run-1"));
    expect(wikidataProcessedRunDir("run-1", "tmp")).toBe(
      join("tmp", "processed", "wikidata", "run-1"),
    );
    expect(wikidataReportDir("run-1")).toBe(join("data", "reports", "wikidata", "run-1"));
  });

  it("formats page filenames with zero padding", () => {
    expect(formatPageFileName(0)).toBe("000000.json");
    expect(formatPageFileName(50)).toBe("000050.json");
  });

  it("creates filesystem-safe run ids", () => {
    const id = newRunId(new Date("2026-08-11T12:48:00.814Z"));
    expect(id).toBe("2026-08-11T12-48-00-814Z");
    expect(id).not.toMatch(/[:.]/);
  });
});
