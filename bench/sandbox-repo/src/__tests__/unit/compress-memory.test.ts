import { describe, it, expect, vi } from 'vitest';
import { compressMemoryInput } from '../../engine/compress-memory.js';

describe('compressMemoryInput', () => {
  it('returns parsed memory + token counts from openai usage', async () => {
    const openai = {
      compressWithUsage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'Auth via x-api-key',
          content: 'API auth uses x-api-key header',
          concepts: ['auth', 'api-key'],
          files: ['src/middleware/api-key.middleware.ts'],
          type: 'architecture',
        }),
        promptTokens: 320,
        completionTokens: 45,
      }),
    };
    const result = await compressMemoryInput(
      'Authentication uses the x-api-key header on every request.',
      openai as any,
    );
    expect(result.title).toBe('Auth via x-api-key');
    expect(result.concepts).toEqual(['auth', 'api-key']);
    expect(result.files).toEqual(['src/middleware/api-key.middleware.ts']);
    expect(result.type).toBe('architecture');
    expect(result.sourceTokens).toBe(320);
    expect(result.compressedTokens).toBe(45);
  });

  it('falls back gracefully when LLM returns non-JSON', async () => {
    const openai = {
      compressWithUsage: vi.fn().mockResolvedValue({
        content: 'definitely not json',
        promptTokens: 100,
        completionTokens: 20,
      }),
    };
    const result = await compressMemoryInput('the raw memory text', openai as any);
    expect(result.content).toBe('the raw memory text');
    expect(result.type).toBe('fact');
    expect(result.concepts).toEqual([]);
    expect(result.files).toEqual([]);
    expect(result.sourceTokens).toBe(100);
    expect(result.compressedTokens).toBe(20);
  });

  it('defaults missing fields to safe values', async () => {
    const openai = {
      compressWithUsage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ title: 't', content: 'c' }),
        promptTokens: 50,
        completionTokens: 10,
      }),
    };
    const result = await compressMemoryInput('hi', openai as any);
    expect(result.type).toBe('fact');
    expect(result.concepts).toEqual([]);
    expect(result.files).toEqual([]);
  });
});
