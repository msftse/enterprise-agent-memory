import { describe, it, expect, vi } from 'vitest';
import { compressObservation } from '../../engine/compress.js';
import type { RawObservation } from '../../types/models.js';
import type { AzureOpenAIAdapter } from '../../adapters/azure-openai.adapter.js';

function makeMockRaw(overrides?: Partial<RawObservation>): RawObservation {
  return {
    id: 'obs-1',
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    timestamp: '2024-01-15T10:00:00Z',
    hookType: 'post_tool_use',
    toolName: 'file_read',
    toolInput: { path: '/src/main.ts' },
    toolOutput: 'const x = 1;',
    raw: {},
    ...overrides,
  };
}

describe('compressObservation', () => {
  it('parses valid JSON LLM output into structured observation', async () => {
    const llmResponse = {
      title: 'Read main.ts file',
      subtitle: 'Reading the main source file',
      facts: ['Read TypeScript source file'],
      narrative: 'Agent read the main TypeScript source file to understand the codebase.',
      concepts: ['typescript', 'source-code'],
      files: ['/src/main.ts'],
      importance: 7,
      type: 'file_read',
    };

    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue(JSON.stringify(llmResponse)),
    } as unknown as AzureOpenAIAdapter;

    const result = await compressObservation(makeMockRaw(), mockOpenAI);

    expect(result.id).toBe('obs-1');
    expect(result.tenantId).toBe('tenant-1');
    expect(result.sessionId).toBe('session-1');
    expect(result.title).toBe('Read main.ts file');
    expect(result.type).toBe('file_read');
    expect(result.importance).toBe(7);
    expect(result.facts).toEqual(['Read TypeScript source file']);
    expect(result.concepts).toEqual(['typescript', 'source-code']);
    expect(result.files).toEqual(['/src/main.ts']);
    expect(result.narrative).toContain('main TypeScript source file');
    expect(mockOpenAI.compress).toHaveBeenCalledOnce();
  });

  it('falls back gracefully when LLM returns invalid JSON', async () => {
    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue('This is not valid JSON at all'),
    } as unknown as AzureOpenAIAdapter;

    const result = await compressObservation(makeMockRaw(), mockOpenAI);

    expect(result.title).toContain('post_tool_use');
    expect(result.title).toContain('file_read');
    expect(result.importance).toBe(5);
    expect(result.narrative).toBe('This is not valid JSON at all');
    expect(result.facts).toEqual([]);
  });

  it('clamps importance above 10 to 10', async () => {
    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue(JSON.stringify({
        title: 'Test',
        importance: 15,
        type: 'other',
      })),
    } as unknown as AzureOpenAIAdapter;

    const result = await compressObservation(makeMockRaw(), mockOpenAI);
    expect(result.importance).toBe(10);
  });

  it('clamps importance below 0 to 0', async () => {
    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue(JSON.stringify({
        title: 'Test',
        importance: -5,
        type: 'other',
      })),
    } as unknown as AzureOpenAIAdapter;

    const result = await compressObservation(makeMockRaw(), mockOpenAI);
    expect(result.importance).toBe(0);
  });

  it('defaults missing fields to safe values', async () => {
    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue(JSON.stringify({})),
    } as unknown as AzureOpenAIAdapter;

    const result = await compressObservation(makeMockRaw(), mockOpenAI);

    expect(result.title).toBe('');
    expect(result.facts).toEqual([]);
    expect(result.narrative).toBe('');
    expect(result.concepts).toEqual([]);
    expect(result.files).toEqual([]);
    expect(result.importance).toBe(5);
    expect(result.type).toBe('other');
  });

  it('truncates long toolOutput to 4000 chars in LLM input', async () => {
    const longOutput = 'x'.repeat(5000);
    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue(JSON.stringify({ title: 'T' })),
    } as unknown as AzureOpenAIAdapter;

    await compressObservation(
      makeMockRaw({ toolOutput: longOutput }),
      mockOpenAI,
    );

    const callArg = (mockOpenAI.compress as any).mock.calls[0][1];
    const parsed = JSON.parse(callArg);
    expect(parsed.toolOutput.length).toBe(4000);
  });

  it('preserves original observation metadata', async () => {
    const mockOpenAI = {
      compress: vi.fn().mockResolvedValue(JSON.stringify({ title: 'T', type: 'search' })),
    } as unknown as AzureOpenAIAdapter;

    const raw = makeMockRaw({
      id: 'custom-id',
      tenantId: 'custom-tenant',
      sessionId: 'custom-session',
      timestamp: '2024-06-01T12:00:00Z',
    });

    const result = await compressObservation(raw, mockOpenAI);

    expect(result.id).toBe('custom-id');
    expect(result.tenantId).toBe('custom-tenant');
    expect(result.sessionId).toBe('custom-session');
    expect(result.timestamp).toBe('2024-06-01T12:00:00Z');
  });
});
