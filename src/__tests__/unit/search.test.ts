import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from '../../engine/search.js';
import type { SearchContext } from '../../engine/search.js';

function createMockSearchContext(
  searchResults: any[] = [],
): SearchContext {
  return {
    openai: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as any,
    search: {
      hybridSearch: vi.fn().mockResolvedValue(searchResults),
    } as any,
  };
}

describe('hybridSearch', () => {
  it('generates query embedding and calls AI Search', async () => {
    const ctx = createMockSearchContext([
      {
        id: 'doc-1',
        tenantId: 'tenant-1',
        docType: 'memory',
        title: 'Test Result',
        content: 'Test content',
        score: 0.95,
        bm25Score: 0.8,
        vectorScore: 0.9,
      },
    ]);

    const result = await hybridSearch(
      'tenant-1',
      { query: 'test query' },
      ctx,
    );

    expect(ctx.openai.embed).toHaveBeenCalledWith('test query');
    expect(ctx.search.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        query: 'test query',
        queryVector: [0.1, 0.2, 0.3],
      }),
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Test Result');
    expect(result.results[0].id).toBe('doc-1');
    expect(result.results[0].score).toBe(0.95);
    expect(result.totalCount).toBe(1);
    expect(result.searchDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('maps scope "observations" to docType "observation"', async () => {
    const ctx = createMockSearchContext();

    await hybridSearch('t', { query: 'q', scope: 'observations' }, ctx);

    expect(ctx.search.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ docType: 'observation' }),
    );
  });

  it('maps scope "memories" to docType "memory"', async () => {
    const ctx = createMockSearchContext();

    await hybridSearch('t', { query: 'q', scope: 'memories' }, ctx);

    expect(ctx.search.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ docType: 'memory' }),
    );
  });

  it('maps scope "all" to docType undefined', async () => {
    const ctx = createMockSearchContext();

    await hybridSearch('t', { query: 'q', scope: 'all' }, ctx);

    expect(ctx.search.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ docType: undefined }),
    );
  });

  it('passes limit, sessionId, project, and filters', async () => {
    const ctx = createMockSearchContext();

    await hybridSearch(
      'tenant-1',
      {
        query: 'q',
        limit: 5,
        sessionId: 'sess-1',
        project: 'my-project',
        filters: { type: ['pattern'], minImportance: 3 },
      },
      ctx,
    );

    expect(ctx.search.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 5,
        sessionId: 'sess-1',
        project: 'my-project',
        filters: { type: ['pattern'], minImportance: 3 },
      }),
    );
  });

  it('defaults limit to 10', async () => {
    const ctx = createMockSearchContext();

    await hybridSearch('t', { query: 'q' }, ctx);

    expect(ctx.search.hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('returns empty results when no matches', async () => {
    const ctx = createMockSearchContext([]);

    const result = await hybridSearch('t', { query: 'nope' }, ctx);

    expect(result.results).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});
