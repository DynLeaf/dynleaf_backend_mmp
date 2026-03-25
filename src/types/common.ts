export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export const buildPagination = (
  page: number,
  limit: number,
  total: number
): PaginationResult => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasMore: page * limit < total,
});

export const parsePaginationQuery = (
  query: Record<string, unknown>,
  defaults: { page?: number; limit?: number } = {}
): PaginationParams => {
  const page = Math.max(parseInt(String(query.page || defaults.page || 1), 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(String(query.limit || defaults.limit || 10), 10) || 10, 1),
    100
  );
  return { page, limit };
};
