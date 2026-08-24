/**
 * Offset pagination helper. Kept as a pure function (no DB/Express
 * dependency) so it's trivially unit-testable per the assignment's
 * "Unit tests: Pagination helper" requirement.
 */

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parsePagination(query: PaginationQuery): PaginationParams {
  let page = Number(query.page);
  let limit = Number(query.limit);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;

  page = Math.floor(page);
  limit = Math.floor(Math.min(limit, MAX_LIMIT));

  return { page, limit, offset: (page - 1) * limit };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return { data, total, page: params.page, limit: params.limit };
}
