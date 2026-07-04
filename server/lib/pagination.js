// Shared limit/offset pagination for list endpoints. Keeps a sane default page
// size and a hard cap so a client can never ask for an unbounded result set.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePagination(queryParams = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  let limit = parseInt(queryParams.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  let offset = parseInt(queryParams.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  return { limit, offset };
}

// Builds the response metadata block. `total` is derived from a
// `COUNT(*) OVER() AS total_count` window column on the list query (0 when the
// page is empty).
function paginationMeta(rows, limit, offset) {
  const total = rows.length > 0 ? Number(rows[0].total_count) || 0 : 0;
  return { total, limit, offset, hasMore: offset + rows.length < total };
}

module.exports = { parsePagination, paginationMeta, DEFAULT_LIMIT, MAX_LIMIT };
