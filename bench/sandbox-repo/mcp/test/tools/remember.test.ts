import { describe, it, expect, vi } from 'vitest';
import { rememberTool } from '../../src/tools/remember.js';

function fakeApi(postImpl: ReturnType<typeof vi.fn>) {
  return { post: postImpl, get: vi.fn() } as unknown as import('../../src/api.js').ApiClient;
}

describe('rememberTool', () => {
  it('posts to /api/v1/memories with derived title and default type=fact', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { id: 'm-1', title: 'Hello world', createdAt: '2026-05-27T00:00:00Z' },
    });
    const handler = rememberTool(fakeApi(post));
    const result = await handler({ content: 'Hello world' });
    expect(post).toHaveBeenCalledWith('/api/v1/memories', expect.objectContaining({
      content: 'Hello world',
      title: 'Hello world',
      type: 'fact',
    }));
    expect(result).toEqual({ memoryId: 'm-1', title: 'Hello world', createdAt: '2026-05-27T00:00:00Z' });
  });

  it('respects explicit type, title, concepts, files', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { id: 'm-2', title: 'Custom', createdAt: 'now' },
    });
    const handler = rememberTool(fakeApi(post));
    await handler({
      content: 'long body...',
      type: 'architecture',
      title: 'Custom',
      concepts: ['auth'],
      files: ['src/auth.ts'],
    });
    expect(post).toHaveBeenCalledWith('/api/v1/memories', {
      type: 'architecture',
      title: 'Custom',
      content: 'long body...',
      concepts: ['auth'],
      files: ['src/auth.ts'],
    });
  });

  it('rejects empty content', async () => {
    const handler = rememberTool(fakeApi(vi.fn()));
    await expect(handler({ content: '' })).rejects.toThrow(/content is required/);
  });

  it('truncates derived title to 80 chars', async () => {
    const post = vi.fn().mockResolvedValue({ data: { id: 'm', title: 'x', createdAt: 't' } });
    const handler = rememberTool(fakeApi(post));
    const longLine = 'x'.repeat(200);
    await handler({ content: longLine });
    const sent = post.mock.calls[0][1] as { title: string };
    expect(sent.title.length).toBe(80);
    expect(sent.title.endsWith('...')).toBe(true);
  });
});
