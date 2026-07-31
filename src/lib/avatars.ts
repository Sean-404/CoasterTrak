export const AVATAR_KEYS = [
  "rose",
  "sky",
  "violet",
  "amber",
  "orange",
  "emerald",
  "slate",
  "cyan",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

export const DEFAULT_AVATAR_KEY: AvatarKey = "amber";

/** Map legacy coaster-icon keys to color keys. */
const LEGACY_AVATAR_KEY_MAP: Record<string, AvatarKey> = {
  loop: "rose",
  hill: "sky",
  corkscrew: "violet",
  train: "amber",
  launch: "orange",
  drop: "emerald",
  track: "slate",
  car: "cyan",
};

export const AVATAR_OPTIONS: { key: AvatarKey; label: string }[] = [
  { key: "rose", label: "Rose" },
  { key: "sky", label: "Sky" },
  { key: "violet", label: "Violet" },
  { key: "amber", label: "Amber" },
  { key: "orange", label: "Orange" },
  { key: "emerald", label: "Emerald" },
  { key: "slate", label: "Slate" },
  { key: "cyan", label: "Cyan" },
];

export function isAvatarKey(value: unknown): value is AvatarKey {
  return typeof value === "string" && (AVATAR_KEYS as readonly string[]).includes(value);
}

export function normalizeAvatarKey(value: unknown): AvatarKey {
  if (typeof value !== "string") return DEFAULT_AVATAR_KEY;
  if (isAvatarKey(value)) return value;
  return LEGACY_AVATAR_KEY_MAP[value] ?? DEFAULT_AVATAR_KEY;
}

/** Up to 2 initials from a display name (e.g. "James M" → "JM"). */
export function initialsFromName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";

  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? "";
    const b = parts[1]?.[0] ?? "";
    return `${a}${b}`.toUpperCase();
  }

  const compact = parts[0] ?? trimmed;
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return compact.slice(0, 1).toUpperCase() || "?";
}
