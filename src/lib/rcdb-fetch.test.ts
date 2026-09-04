import { describe, expect, it } from "vitest";

import { parseRcdbCoasterHtml, rcdbRowNeedsStats } from "./rcdb-fetch";

const KINGDA_HTML = `
<section>
  <div id=feature>
    <div><h1>Kingda Ka</h1></div>
    <p>Removed, <a href="/g.htm?id=318">Operated</a> from <time datetime="2005-05-21"></time> to <time datetime="2024-11-10"></time></p>
  </div>
</section>
<section><h3>Tracks</h3>
<table class=stat-tbl><tbody>
<tr><th>Length<td><span class=float>3118</span> ft
<tr><th>Height<td><span class=float>456</span> ft
<tr><th>Speed<td><span class=float>128</span> mph
<tr><th>Inversions<td>0
<tr><th>Duration<td>0:28
</tbody></table>
</section>
`;

describe("parseRcdbCoasterHtml", () => {
  it("parses track stats and defunct status", () => {
    expect(parseRcdbCoasterHtml(KINGDA_HTML, "2832")).toEqual({
      rcdbId: "2832",
      lengthFt: 3118,
      heightFt: 456,
      speedMph: 128,
      inversions: 0,
      durationS: 28,
      status: "Defunct",
    });
  });
});

describe("rcdbRowNeedsStats", () => {
  it("is true when an rcdb id exists and any core field is null", () => {
    expect(
      rcdbRowNeedsStats({
        rcdbId: "2832",
        lengthFt: 3118,
        heightFt: null,
        speedMph: 128,
        durationS: 28,
        inversions: 0,
      }),
    ).toBe(true);
  });

  it("is false without an rcdb id", () => {
    expect(rcdbRowNeedsStats({ rcdbId: null, heightFt: null })).toBe(false);
  });
});
