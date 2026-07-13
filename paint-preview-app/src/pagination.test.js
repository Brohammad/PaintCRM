import { describe, it, expect } from 'vitest';
import { withPageParams, createPaginator, DEFAULT_PAGE_SIZE } from './pagination.js';

describe('withPageParams', () => {
  it('adds a query string when the path has none', () => {
    expect(withPageParams('/api/x', { limit: 10, offset: 20 })).toBe('/api/x?limit=10&offset=20');
  });

  it('appends with & when the path already has a query', () => {
    expect(withPageParams('/api/x?q=foo', { limit: 5, offset: 0 })).toBe(
      '/api/x?q=foo&limit=5&offset=0'
    );
  });

  it('uses defaults when no options are given', () => {
    expect(withPageParams('/api/x')).toBe(`/api/x?limit=${DEFAULT_PAGE_SIZE}&offset=0`);
  });
});

describe('createPaginator', () => {
  it('absorbs server metadata and advances the offset', () => {
    const p = createPaginator(25);
    p.absorb({ total: 60, limit: 25, offset: 0, hasMore: true });
    expect(p.total).toBe(60);
    expect(p.offset).toBe(25);
    expect(p.hasMore).toBe(true);
    expect(p.params()).toEqual({ limit: 25, offset: 25 });
  });

  it('caps the offset at total and clears hasMore on the last page', () => {
    const p = createPaginator(25);
    p.absorb({ total: 60, limit: 25, offset: 0, hasMore: true });
    p.absorb({ total: 60, limit: 25, offset: 25, hasMore: true });
    p.absorb({ total: 60, limit: 25, offset: 50, hasMore: false });
    expect(p.offset).toBe(60);
    expect(p.hasMore).toBe(false);
  });

  it('reset() returns to the first page', () => {
    const p = createPaginator(25);
    p.absorb({ total: 60, limit: 25, offset: 0, hasMore: true });
    p.reset();
    expect(p.offset).toBe(0);
    expect(p.total).toBe(0);
    expect(p.hasMore).toBe(false);
  });

  it('infers hasMore from offset/total when the flag is absent', () => {
    const p = createPaginator(25);
    p.absorb({ total: 60, limit: 25, offset: 0 });
    expect(p.hasMore).toBe(true);
  });
});
