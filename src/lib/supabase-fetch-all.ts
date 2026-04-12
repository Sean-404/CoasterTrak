type ListResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Supabase/PostgREST caps list responses (default max_rows is often 1000).
 * Page with `.order("id", { ascending: true }).range(from, to)` on the query.
 * `fetchPage` may return a thenable builder or a Promise (both are supported).
 */
export async function fetchAllPages<T>(
  pageSize: number,
  fetchPage: (from: number, to: number) => unknown,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = (await Promise.resolve(
      fetchPage(from, to),
    )) as ListResult<T>;
    if (error) return { data: out, error };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: out, error: null };
}

/** Matches typical PostgREST default `max_rows` for list endpoints. */
export const SUPABASE_PAGE_SIZE = 1000;
