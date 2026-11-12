import { describe, expect, it } from "vitest";
import {
  commonsFileName,
  commonsFilePageUrl,
  creditFromExtMetadata,
  isLocalWikiUpload,
  plainTextFromHtml,
} from "@/lib/commons-credit";

describe("commonsFileName", () => {
  it("reads Special:FilePath links from Wikidata, with or without a width", () => {
    expect(
      commonsFileName(
        "https://commons.wikimedia.org/wiki/Special:FilePath/Islands%20of%20Adventure%20Orlando%20%2851149417278%29%20%28cropped%29.jpg?width=96",
      ),
    ).toBe("Islands of Adventure Orlando (51149417278) (cropped).jpg");
  });

  it("reads upload.wikimedia.org originals and thumbs", () => {
    expect(
      commonsFileName("https://upload.wikimedia.org/wikipedia/commons/1/18/Velocicoaster_Top_Hat.jpg"),
    ).toBe("Velocicoaster Top Hat.jpg");
    expect(
      commonsFileName(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Velocicoaster_Top_Hat.jpg/320px-Velocicoaster_Top_Hat.jpg",
      ),
    ).toBe("Velocicoaster Top Hat.jpg");
  });

  it("reads File: page links", () => {
    expect(commonsFileName("https://commons.wikimedia.org/wiki/File:The_Smiler.jpg")).toBe("The Smiler.jpg");
  });

  it("ignores photos that are not Commons files", () => {
    expect(commonsFileName("https://upload.wikimedia.org/wikipedia/en/a/ab/Ride_logo.png")).toBeNull();
    expect(commonsFileName("https://example.supabase.co/storage/v1/object/public/ride-photos/1.jpg")).toBeNull();
    expect(commonsFileName("not a url")).toBeNull();
    expect(commonsFileName(null)).toBeNull();
  });
});

describe("isLocalWikiUpload", () => {
  it("flags files uploaded to a single Wikipedia, which are usually fair-use only", () => {
    expect(isLocalWikiUpload("https://upload.wikimedia.org/wikipedia/en/a/ab/Ride_logo.png")).toBe(true);
    expect(isLocalWikiUpload("https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Ride.jpg/320px-Ride.jpg")).toBe(
      true,
    );
  });

  it("allows Commons and other hosts", () => {
    expect(isLocalWikiUpload("https://upload.wikimedia.org/wikipedia/commons/1/18/Ride.jpg")).toBe(false);
    expect(isLocalWikiUpload("https://commons.wikimedia.org/wiki/Special:FilePath/Ride.jpg")).toBe(false);
    expect(isLocalWikiUpload("https://example.com/ride.jpg")).toBe(false);
  });
});

describe("plainTextFromHtml", () => {
  it("strips links and decodes entities", () => {
    expect(
      plainTextFromHtml(
        '<a rel="nofollow" class="external text" href="https://www.flickr.com/people/x">Eric A. Soto</a>',
      ),
    ).toBe("Eric A. Soto");
    expect(plainTextFromHtml("Jeremy Thompson &amp; friends<br/>&#40;Flickr&#41;")).toBe(
      "Jeremy Thompson & friends (Flickr)",
    );
  });

  it("returns null for empty values and clamps long ones", () => {
    expect(plainTextFromHtml("<span> </span>")).toBeNull();
    const long = plainTextFromHtml("a".repeat(300));
    expect(long?.length).toBe(120);
    expect(long?.endsWith("…")).toBe(true);
  });
});

describe("creditFromExtMetadata", () => {
  it("builds the author, licence and file page link", () => {
    expect(
      creditFromExtMetadata("Islands of Adventure Orlando (51149417278) (cropped).jpg", {
        Artist: { value: '<a href="https://www.flickr.com/people/x">Eric A. Soto</a>' },
        LicenseShortName: { value: "CC BY-SA 2.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/2.0" },
      }),
    ).toEqual({
      author: "Eric A. Soto",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Islands_of_Adventure_Orlando_(51149417278)_(cropped).jpg",
    });
  });

  it("drops licence links that are not http(s)", () => {
    expect(creditFromExtMetadata("A.jpg", { LicenseUrl: { value: "javascript:alert(1)" } }).licenseUrl).toBeNull();
  });

  it("encodes the file page URL", () => {
    expect(commonsFilePageUrl("Ride? #1.jpg")).toBe("https://commons.wikimedia.org/wiki/File:Ride%3F_%231.jpg");
  });
});
