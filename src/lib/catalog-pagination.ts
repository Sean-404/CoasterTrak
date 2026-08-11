export const CATALOG_PAGE_SIZE = 100;

export function parseCatalogPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function catalogTotalPages(total: number, pageSize = CATALOG_PAGE_SIZE): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampCatalogPage(page: number, total: number, pageSize = CATALOG_PAGE_SIZE): number {
  const pages = catalogTotalPages(total, pageSize);
  return Math.min(Math.max(1, page), pages);
}

export function sliceCatalogPage<T>(
  items: T[],
  page: number,
  pageSize = CATALOG_PAGE_SIZE,
): { items: T[]; page: number; total: number; totalPages: number; from: number; to: number } {
  const total = items.length;
  const current = clampCatalogPage(page, total, pageSize);
  const start = (current - 1) * pageSize;
  const sliced = items.slice(start, start + pageSize);
  return {
    items: sliced,
    page: current,
    total,
    totalPages: catalogTotalPages(total, pageSize),
    from: total === 0 ? 0 : start + 1,
    to: start + sliced.length,
  };
}

export function catalogHref(
  path: string,
  opts: { q?: string; page?: number },
): string {
  const params = new URLSearchParams();
  const q = opts.q?.trim();
  if (q) params.set("q", q);
  if (opts.page != null && opts.page > 1) params.set("page", String(opts.page));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
