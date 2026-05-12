function parsePagination(query, defaults = {}) {
  const maxLimit = defaults.maxLimit || 100;
  const defaultLimit = defaults.limit || 20;
  const defaultOffset = defaults.offset || 0;

  let limit = parseInt(query.limit, 10);
  let offset = parseInt(query.offset, 10);

  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isFinite(offset) || offset < 0) offset = defaultOffset;

  return { limit, offset };
}

module.exports = { parsePagination };
