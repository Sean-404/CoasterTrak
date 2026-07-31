import { cleanCoasterName } from "@/lib/display";

/** URL-safe slug fragment from a display name. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "") || "item";
}

/** Stable public slug: `{name}-{id}` so renames/collisions stay resolvable. */
export function entitySlug(name: string, id: number): string {
  return `${slugify(name)}-${id}`;
}

export function parkSlug(name: string, id: number): string {
  return entitySlug(name, id);
}

export function coasterSlug(name: string, id: number): string {
  return entitySlug(cleanCoasterName(name), id);
}

/** Parse trailing numeric id from `/parks/foo-123` style slugs. */
export function parseIdFromSlug(slug: string): number | null {
  const match = slug.trim().match(/-(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}
