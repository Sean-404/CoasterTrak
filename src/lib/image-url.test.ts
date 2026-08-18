import { describe, expect, it } from "vitest";
import { compactImageUrl } from "./image-url";

describe("compactImageUrl", () => {
  it("adds a width to Wikimedia FilePath URLs", () => {
    expect(
      compactImageUrl("https://commons.wikimedia.org/wiki/Special:FilePath/Nemesis.jpg", 96),
    ).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/Nemesis.jpg?width=96");
  });

  it("downsizes an existing Wikimedia thumb", () => {
    expect(
      compactImageUrl(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Ride.jpg/3840px-Ride.jpg",
        96,
      ),
    ).toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Ride.jpg/96px-Ride.jpg");
  });

  it("leaves signed ride photo URLs unchanged", () => {
    const url = "https://bbpxiqucihcxrbbzqbtc.supabase.co/storage/v1/object/sign/ride-photos/u/1.jpg?token=abc";
    expect(compactImageUrl(url, 96)).toBe(url);
  });
});
