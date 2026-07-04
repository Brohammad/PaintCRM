// Client-side pagination helpers that mirror the backend's limit/offset +
// { total, limit, offset, hasMore } metadata contract.

export const DEFAULT_PAGE_SIZE = 25;

// Appends limit/offset (and passes through any existing query string) to a path.
export function withPageParams(path, { limit = DEFAULT_PAGE_SIZE, offset = 0 } = {}) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}limit=${limit}&offset=${offset}`;
}

// Tracks paging state as the user loads more pages of a list.
export function createPaginator(pageSize = DEFAULT_PAGE_SIZE) {
  return {
    limit: pageSize,
    offset: 0,
    total: 0,
    hasMore: false,
    reset() {
      this.offset = 0;
      this.total = 0;
      this.hasMore = false;
      return this;
    },
    // Folds a server pagination block into the local state and advances offset.
    absorb(meta) {
      if (meta && typeof meta === 'object') {
        this.total = Number(meta.total) || 0;
        this.limit = Number(meta.limit) || this.limit;
        const loaded = (Number(meta.offset) || 0) + this.limit;
        this.offset = Math.min(loaded, this.total);
        this.hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : this.offset < this.total;
      }
      return this;
    },
    // Params for fetching the current page.
    params() {
      return { limit: this.limit, offset: this.offset };
    },
  };
}
