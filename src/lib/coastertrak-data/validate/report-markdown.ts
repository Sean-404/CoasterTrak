import type { QualityFinding, QualityReport } from "../types";

export function renderQualityReportMarkdown(report: QualityReport): string {
  const lines: string[] = [
    "# Wikidata catalog quality report",
    "",
    `Generated: ${report.generatedAt}`,
    `Source: \`${report.sourcePath}\``,
    report.metaPath ? `Meta: \`${report.metaPath}\`` : "",
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total rows | ${report.totalRows} |`,
    `| Errors | ${report.summary.errors} |`,
    `| Warnings | ${report.summary.warnings} |`,
    `| Info | ${report.summary.info} |`,
    `| Missing all stats | ${report.summary.rowsMissingAllQuantities} |`,
    `| Missing park | ${report.summary.rowsMissingPark} |`,
    `| Missing coordinates | ${report.summary.rowsMissingCoords} |`,
    `| Query mode | ${report.summary.sourceQueryMode ?? "unknown"} |`,
    `| Lite fallback | ${report.summary.usedLiteFallback ?? "unknown"} |`,
    "",
    "### Status breakdown",
    "",
  ];

  for (const [status, count] of Object.entries(report.summary.statusCounts).sort()) {
    lines.push(`- **${status}**: ${count}`);
  }

  const bySeverity = (severity: QualityFinding["severity"]) =>
    report.findings.filter((f) => f.severity === severity);

  for (const severity of ["error", "warning", "info"] as const) {
    const items = bySeverity(severity);
    if (items.length === 0) continue;
    lines.push("", `## ${severity.charAt(0).toUpperCase()}${severity.slice(1)}s (${items.length})`, "");
    for (const f of items.slice(0, 50)) {
      const id = f.wikidataId ? ` **${f.wikidataId}**` : "";
      const label = f.label ? ` — ${f.label}` : "";
      lines.push(`- \`${f.code}\`${id}${label}: ${f.message}`);
    }
    if (items.length > 50) {
      lines.push(`- … and ${items.length - 50} more`);
    }
  }

  lines.push("");
  return lines.filter((l) => l !== undefined).join("\n");
}
