import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type { Memory, AuditEntry } from '../types/models.js';
import { nanoid } from 'nanoid';

export interface MemoryContext {
  cosmos: CosmosAdapter;
  openai: AzureOpenAIAdapter;
  search: AISearchAdapter;
  blobStorage: BlobStorageAdapter;
}

export async function createMemory(
  tenantId: string,
  input: {
    type: Memory['type'];
    title: string;
    content: string;
    concepts?: string[];
    files?: string[];
    sessionIds?: string[];
    sourceObservationIds?: string[];
  },
  ctx: MemoryContext,
): Promise<Memory> {
  const now = new Date().toISOString();
  const embeddingText = `${input.title}. ${input.content} ${(input.concepts ?? []).join(', ')}`;
  const embedding = await ctx.openai.embed(embeddingText);

  const memory: Memory = {
    id: nanoid(),
    tenantId,
    createdAt: now,
    updatedAt: now,
    type: input.type,
    title: input.title,
    content: input.content,
    concepts: input.concepts ?? [],
    files: input.files ?? [],
    sessionIds: input.sessionIds ?? [],
    strength: 1.0,
    version: 1,
    sourceObservationIds: input.sourceObservationIds,
    isLatest: true,
    embedding,
  };

  await ctx.cosmos.create('memories', memory);

  await ctx.search.indexDocument({
    id: memory.id,
    tenantId,
    docType: 'memory',
    title: memory.title,
    content: memory.content,
    concepts: memory.concepts,
    files: memory.files,
    type: memory.type,
    strength: memory.strength,
    timestamp: memory.createdAt,
    embedding,
  });

  const audit: AuditEntry = {
    id: nanoid(),
    tenantId,
    timestamp: now,
    operation: 'remember',
    functionId: 'createMemory',
    targetIds: [memory.id],
    details: { type: memory.type, title: memory.title },
  };
  await ctx.blobStorage.writeAuditEntry(tenantId, audit);

  return memory;
}

export async function evolveMemory(
  tenantId: string,
  memoryId: string,
  updates: { content: string; concepts?: string[]; files?: string[] },
  ctx: MemoryContext,
): Promise<Memory> {
  const existing = await ctx.cosmos.read<Memory>(
    'memories',
    memoryId,
    tenantId,
  );
  if (!existing) throw new Error(`Memory ${memoryId} not found`);

  // Mark old version as not latest
  existing.isLatest = false;
  await ctx.cosmos.update('memories', existing);

  // Create new version
  const now = new Date().toISOString();
  const embeddingText = `${existing.title}. ${updates.content} ${(updates.concepts ?? existing.concepts).join(', ')}`;
  const embedding = await ctx.openai.embed(embeddingText);

  const evolved: Memory = {
    ...existing,
    id: nanoid(),
    updatedAt: now,
    content: updates.content,
    concepts: updates.concepts ?? existing.concepts,
    files: updates.files ?? existing.files,
    version: existing.version + 1,
    parentId: existing.id,
    isLatest: true,
    embedding,
  };

  await ctx.cosmos.create('memories', evolved);

  await ctx.search.indexDocument({
    id: evolved.id,
    tenantId,
    docType: 'memory',
    title: evolved.title,
    content: evolved.content,
    concepts: evolved.concepts,
    files: evolved.files,
    type: evolved.type,
    strength: evolved.strength,
    timestamp: evolved.updatedAt,
    embedding,
  });

  // Remove old from search index
  await ctx.search.deleteDocument(existing.id);

  const audit: AuditEntry = {
    id: nanoid(),
    tenantId,
    timestamp: now,
    operation: 'evolve',
    functionId: 'evolveMemory',
    targetIds: [evolved.id, existing.id],
    details: { fromVersion: existing.version, toVersion: evolved.version },
  };
  await ctx.blobStorage.writeAuditEntry(tenantId, audit);

  return evolved;
}
