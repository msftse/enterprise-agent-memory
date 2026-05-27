import { describe, it, expect, vi } from 'vitest';
import { listRecentTool } from '../../src/tools/list-recent.js';

function fakeApi(getImpl: ReturnType<typeof vi.fn>) {
  return { get: getImpl, post: vi.fn() } as unknown as import('../../src/api.js').ApiClient;
}

describe('listRecentTool', () => {
  it('calls GET /api/v1/memories with sort/limit qs and maps items', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: '1', title: 'x', type: 'fact', createdAt: 't1' },
          { id: '2', title: 'y', type: 'architecture', createdAt: 't2' },
        ],
      },
    });
    const handler = listRecentTool(fakeApi(get));
    const result = await handler({ limit: 2 });
    expect(get).toHaveBeenCalledWith('/api/v1/memories?limit=2&sortBy=createdAt&sortOrder=desc');
    expect(result).toEqual([
      { id: '1', title: 'x', type: 'fact', createdAt: 't1' },
      { id: '2', title: 'y', type: 'architecture', createdAt: 't2' },
    ]);
  });

  it('defaults limit to 10', async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [] } });
    const handler = listRecentTool(fakeApi(get));
    await handler({});
    expect(get).toHaveBeenCalledWith('/api/v1/memories?limit=10&sortBy=createdAt&sortOrder=desc');
  });
});
