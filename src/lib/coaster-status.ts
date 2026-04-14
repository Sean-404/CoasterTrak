type LifecycleStatus = "Operating" | "Defunct" | "Unknown";

/**
 * Normalize mixed legacy status values into lifecycle-only status.
 * We do not model live queue state (open/closed today) anymore.
 */
export function normalizeLifecycleStatus(
  rawStatus: string | null | undefined,
  opts?: { closingYear?: number | null },
): LifecycleStatus {
  const s = (rawStatus ?? "").trim().toLowerCase();
  if (!s) return "Unknown";

  if (
    s === "operating" ||
    s === "open" ||
    s.includes("reopened") ||
    s.includes("operat") ||
    s.includes("relocated") ||
    s.includes("moved")
  ) {
    return "Operating";
  }

  if (
    s === "defunct" ||
    s.includes("removed") ||
    s.includes("demol") ||
    s.includes("sbno") ||
    s.includes("standing but not operating") ||
    s.includes("permanently closed") ||
    s.includes("scrap")
  ) {
    return "Defunct";
  }

  if (s === "closed") {
    return opts?.closingYear != null ? "Defunct" : "Unknown";
  }

  if (s === "unknown" || s === "n/a" || s === "na") return "Unknown";
  return "Unknown";
}
