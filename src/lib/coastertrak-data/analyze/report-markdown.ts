import type { CatalogAnalysisReport } from "../types";

function formatThemeParksSection(report: CatalogAnalysisReport): string[] {
  const tp = report.themeparks;
  if (!tp) return ["ThemeParks.wiki verification skipped."];
  return [
    `- Parks compared: **${tp.parksCompared}**`,
    `- Snapshot coasters matched: **${tp.totals.matched}** / ${tp.totals.localCoasters}`,
    `- Snapshot-only (unmatched): **${tp.totals.localOnly}**`,
    `- Name mismatch candidates: **${tp.totals.nameMismatchCandidates}**`,
    `- ThemeParks attractions scanned: **${tp.totals.sourceAttractions}**`,
    `- Feed-only likely coasters: **${tp.totals.sourceOnlyLikelyCoaster}**`,
  ];
}

export function renderCatalogAnalysisMarkdown(report: CatalogAnalysisReport): string {
  const d = report.dedupe;
  const lines = [
    "# Catalog analysis report",
    "",
    `Generated: ${report.generatedAt}`,
    `Source: \`${report.sourcePath}\``,
    `Run id: \`${report.sourceRunId}\``,
    "",
    "## Dedupe & conflicts",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Rows | ${d.totalRows} |`,
    `| Parks with label | ${d.parksWithLabel} |`,
    `| Errors | ${d.summary.errors} |`,
    `| Warnings | ${d.summary.warnings} |`,
    `| Duplicate name groups | ${d.summary.duplicateGroups} |`,
    `| Proximate similar pairs | ${d.summary.proximatePairs} |`,
    "",
    "## ThemeParks.wiki snapshot verify",
    "",
    ...formatThemeParksSection(report),
    "",
  ];

  for (const severity of ["error", "warning", "info"] as const) {
    const items = d.findings.filter((f) => f.severity === severity);
    if (items.length === 0) continue;
    lines.push(`## Dedupe ${severity}s (${items.length})`, "");
    for (const f of items.slice(0, 40)) {
      const id = f.wikidataId ? ` **${f.wikidataId}**` : "";
      const label = f.label ? ` — ${f.label}` : "";
      lines.push(`- \`${f.code}\`${id}${label}: ${f.message}`);
    }
    if (items.length > 40) lines.push(`- … and ${items.length - 40} more`);
    lines.push("");
  }

  if (report.themeparks && report.themeparks.parks.length > 0) {
    lines.push("## Parks with snapshot-only coasters", "");
    for (const park of report.themeparks.parks) {
      if (park.localOnly.length === 0) continue;
      lines.push(`### ${park.parkName}`);
      for (const row of park.localOnly.slice(0, 15)) {
        lines.push(
          `- **[${row.severity}]** ${row.coasterName}${row.wikidataId ? ` (${row.wikidataId})` : ""}`,
        );
      }
      if (park.localOnly.length > 15) {
        lines.push(`- … and ${park.localOnly.length - 15} more`);
      }
      lines.push("");
    }
  }

  lines.push(`**Overall:** ${report.passed ? "PASSED" : "FAILED"}`, "");
  return lines.join("\n");
}
