// Cursor-based pagination shared by every list endpoint that used to just
// cap results at a fixed top-N (take: 100/200) with no way to page past
// that cap — see the individual routes for how each applies this. Keyset
// pagination (cursor = last row's id) rather than an offset/page-number
// scheme, since Prisma's `cursor`/`skip: 1` maps directly onto it and it
// stays correct even if rows are inserted while a client is paging through.

export function parsePaginationParams(
  searchParams: URLSearchParams,
  defaultLimit: number,
  maxLimit: number
): { cursor?: string; limit: number } {
  const cursor = searchParams.get("cursor") ?? undefined;
  const requested = Number(searchParams.get("limit"));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), maxLimit) : defaultLimit;
  return { cursor, limit };
}

// Callers fetch `limit + 1` rows (ordered, with the given cursor skipped);
// this slices back down to `limit` and reports whether there's a next page
// without a separate count query.
export function buildPage<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, nextCursor };
}
