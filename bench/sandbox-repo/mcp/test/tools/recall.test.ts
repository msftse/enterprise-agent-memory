import { describe, it, expect, vi } from 'vitest';
import { recallTool } from '../../src/tools/recall.js';

function fakeApi(postImpl: ReturnType<typeof vi.fn>) {
  return { post: postImpl, get: vi.fn() } as unknown as import('../../src/api.js').ApiClient;
}

describe('recallTool', () => {
  it('posts to /api/v1/search with scope=memories and maps results', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        results: [
          { id: 'm1', title: 'A', content: 'a', score: 0.9, bm25Score: 1, vectorScore: 1, type: 'memory' },
          { id: 'm2', title: 'B', content: 'b', score: 0.5, bm25Score: 1, vectorScore: 1, type: 'memory' },
        ],
      },
    });
    const handler = recallTool(fakeApi(post));
    const result = await handler({ query: 'auth', k: 2 });
    expect(post).toHaveBeenCalledWith('/api/v1/search', { query: 'auth', limit: 2, scope: 'memories' });
    expect(result).toEqual([
      { id: 'm1', title: 'A', content: 'a', score: 0.9 },
      { id: 'm2', title: 'B', content: 'b', score: 0.5 },
    ]);
  });

  it('defaults k to 5', async () => {
    const post = vi.fn().mockResolvedValue({ data: { results: [] } });
    const handler = recallTool(fakeApi(post));
    await handler({ query: 'foo' });
    expect(post).toHaveBeenCalledWith('/api/v1/search', { query: 'foo', limit: 5, scope: 'memories' });
  });
});
