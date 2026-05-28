import { describe, it, expect, vi } from 'vitest';
import { hybridSearch } from '../../engine/search.js';
import type { SearchContext } from '../../engine/search.js';

function createMockSearchContext(
  searchResults: any[] = [],
  incrementImpl: (...args: any[]) => Promise<void> = vi.fn().mockResolvedValue(undefined),
): SearchContext {
  return {
    openai: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as any,
    search: {
      hybridSearch: vi.fn().mockResolvedValue(searchResults),
    } as any,
    cosmos: {
      incrementMemoryRecallCount: incrementImpl,
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

  describe('Phase 2 — recall count increments', () => {
    it('fires increment for each memory hit (fire-and-forget)', async () => {
      const incr = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockSearchContext(
        [
          { id: 'mem-1', docType: 'memory',      title: 'a', content: 'a', score: 1, bm25Score: 1, vectorScore: 1 },
          { id: 'obs-1', docType: 'observation', title: 'b', content: 'b', score: 1, bm25Score: 1, vectorScore: 1 },
          { id: 'mem-2', docType: 'memory',      title: 'c', content: 'c', score: 1, bm25Score: 1, vectorScore: 1 },
        ],
        incr,
      );
      await hybridSearch('pilot', { query: 'x' }, ctx);
      // Let the fire-and-forget promise run a microtask:
      await new Promise((r) => setImmediate(r));
      expect(incr).toHaveBeenCalledTimes(2);
      expect(incr).toHaveBeenCalledWith('mem-1', 'pilot');
      expect(incr).toHaveBeenCalledWith('mem-2', 'pilot');
    });

    it('does not increment for observation hits', async () => {
      const incr = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockSearchContext(
        [{ id: 'obs-1', docType: 'observation', title: 'o', content: 'o', score: 1, bm25Score: 1, vectorScore: 1 }],
        incr,
      );
      await hybridSearch('pilot', { query: 'x' }, ctx);
      await new Promise((r) => setImmediate(r));
      expect(incr).not.toHaveBeenCalled();
    });

    it('does not throw when increment fails (fire-and-forget swallows)', async () => {
      const incr = vi.fn().mockRejectedValue(new Error('cosmos down'));
      const ctx = createMockSearchContext(
        [{ id: 'mem-1', docType: 'memory', title: 'a', content: 'a', score: 1, bm25Score: 1, vectorScore: 1 }],
        incr,
      );
      await expect(hybridSearch('pilot', { query: 'x' }, ctx)).resolves.toBeTruthy();
      // Drain the unhandled rejection from allSettled's internals (allSettled never throws,
      // so this is just a sanity check that the search response itself resolved).
    });
  });
});
