import { describe, it, expect, vi } from 'vitest';
import { createMemory, evolveMemory } from '../../engine/remember.js';
import type { MemoryContext } from '../../engine/remember.js';
import type { Memory } from '../../types/models.js';

function createMockContext(): MemoryContext {
  return {
    cosmos: {
      create: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
    } as any,
    openai: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      // Phase 2: createMemory now calls compressWithUsage to extract structure + tokens.
      // Default mock returns minimal valid JSON; promptTokens=100, completionTokens=20.
      compressWithUsage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ title: 'Mock', content: 'Mock', concepts: [], files: [], type: 'fact' }),
        promptTokens: 100,
        completionTokens: 20,
      }),
    } as any,
    search: {
      indexDocument: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined),
    } as any,
    blobStorage: {
      writeAuditEntry: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
}

describe('createMemory', () => {
  it('creates a memory with correct fields', async () => {
    const ctx = createMockContext();

    const memory = await createMemory(
      'tenant-1',
      {
        type: 'pattern',
        title: 'Test Pattern',
        content: 'This is a test pattern for unit tests.',
        concepts: ['testing', 'vitest'],
        files: ['/src/test.ts'],
        sessionIds: ['session-1'],
      },
      ctx,
    );

    expect(memory.tenantId).toBe('tenant-1');
    expect(memory.title).toBe('Test Pattern');
    expect(memory.content).toBe('This is a test pattern for unit tests.');
    expect(memory.type).toBe('pattern');
    expect(memory.version).toBe(1);
    expect(memory.isLatest).toBe(true);
    expect(memory.strength).toBe(1.0);
    expect(memory.concepts).toEqual(['testing', 'vitest']);
    expect(memory.files).toEqual(['/src/test.ts']);
    expect(memory.sessionIds).toEqual(['session-1']);
    expect(memory.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(memory.id).toBeDefined();
    expect(memory.createdAt).toBeDefined();
    expect(memory.updatedAt).toBeDefined();
  });

  it('generates embedding from title, content, and concepts', async () => {
    const ctx = createMockContext();

    await createMemory(
      'tenant-1',
      { type: 'fact', title: 'My Title', content: 'My Content', concepts: ['a', 'b'] },
      ctx,
    );

    expect(ctx.openai.embed).toHaveBeenCalledWith('My Title. My Content a, b');
  });

  it('stores memory in Cosmos DB', async () => {
    const ctx = createMockContext();

    await createMemory(
      'tenant-1',
      { type: 'pattern', title: 'T', content: 'C' },
      ctx,
    );

    expect(ctx.cosmos.create).toHaveBeenCalledWith(
      'memories',
      expect.objectContaining({ tenantId: 'tenant-1', title: 'T' }),
    );
  });

  it('indexes memory in AI Search', async () => {
    const ctx = createMockContext();

    await createMemory(
      'tenant-1',
      { type: 'pattern', title: 'T', content: 'C' },
      ctx,
    );

    expect(ctx.search.indexDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        docType: 'memory',
        title: 'T',
        content: 'C',
        embedding: [0.1, 0.2, 0.3],
      }),
    );
  });

  it('writes audit entry to blob storage', async () => {
    const ctx = createMockContext();

    await createMemory(
      'tenant-1',
      { type: 'bug', title: 'Bug Fix', content: 'Fixed null pointer' },
      ctx,
    );

    expect(ctx.blobStorage.writeAuditEntry).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        operation: 'remember',
        functionId: 'createMemory',
      }),
    );
  });

  it('defaults optional arrays to empty', async () => {
    const ctx = createMockContext();

    const memory = await createMemory(
      'tenant-1',
      { type: 'fact', title: 'T', content: 'C' },
      ctx,
    );

    expect(memory.concepts).toEqual([]);
    expect(memory.files).toEqual([]);
    expect(memory.sessionIds).toEqual([]);
  });
});

describe('evolveMemory', () => {
  const existingMemory: Memory = {
    id: 'mem-1',
    tenantId: 'tenant-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    type: 'pattern',
    title: 'Original Title',
    content: 'Original content',
    concepts: ['old-concept'],
    files: ['/old-file.ts'],
    sessionIds: ['session-1'],
    strength: 1.0,
    version: 1,
    isLatest: true,
  };

  it('creates new version with incremented version number', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue({ ...existingMemory });

    const evolved = await evolveMemory(
      'tenant-1',
      'mem-1',
      { content: 'Updated content', concepts: ['new-concept'] },
      ctx,
    );

    expect(evolved.version).toBe(2);
    expect(evolved.content).toBe('Updated content');
    expect(evolved.concepts).toEqual(['new-concept']);
    expect(evolved.isLatest).toBe(true);
    expect(evolved.parentId).toBe('mem-1');
  });

  it('marks old version as not latest', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue({ ...existingMemory });

    await evolveMemory('tenant-1', 'mem-1', { content: 'new' }, ctx);

    expect(ctx.cosmos.update).toHaveBeenCalledWith(
      'memories',
      expect.objectContaining({ id: 'mem-1', isLatest: false }),
    );
  });

  it('removes old version from search index', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue({ ...existingMemory });

    await evolveMemory('tenant-1', 'mem-1', { content: 'new' }, ctx);

    expect(ctx.search.deleteDocument).toHaveBeenCalledWith('mem-1');
  });

  it('indexes new version in search', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue({ ...existingMemory });

    await evolveMemory('tenant-1', 'mem-1', { content: 'new content' }, ctx);

    expect(ctx.search.indexDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        docType: 'memory',
        content: 'new content',
      }),
    );
  });

  it('writes audit entry with version info', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue({ ...existingMemory });

    await evolveMemory('tenant-1', 'mem-1', { content: 'new' }, ctx);

    expect(ctx.blobStorage.writeAuditEntry).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        operation: 'evolve',
        details: expect.objectContaining({ fromVersion: 1, toVersion: 2 }),
      }),
    );
  });

  it('throws when memory not found', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue(null);

    await expect(
      evolveMemory('tenant-1', 'nonexistent', { content: 'x' }, ctx),
    ).rejects.toThrow('Memory nonexistent not found');
  });

  it('preserves existing files when not provided in updates', async () => {
    const ctx = createMockContext();
    (ctx.cosmos.read as any).mockResolvedValue({ ...existingMemory });

    const evolved = await evolveMemory(
      'tenant-1',
      'mem-1',
      { content: 'updated' },
      ctx,
    );

    expect(evolved.files).toEqual(['/old-file.ts']);
  });
});
