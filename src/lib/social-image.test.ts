import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("link preview images", () => {
  it("lists an image in every openGraph block, since Next does not inherit one", () => {
    const missing = sourceFiles("src/app").filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("openGraph: {") && !/images: \[/.test(source);
    });
    expect(missing).toEqual([]);
  });
});
