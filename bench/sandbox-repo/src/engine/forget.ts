import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type { Memory, AuditEntry } from '../types/models.js';
import { nanoid } from 'nanoid';

export interface ForgetContext {
  cosmos: CosmosAdapter;
  search: AISearchAdapter;
  blobStorage: BlobStorageAdapter;
}

export async function forgetMemory(
  tenantId: string,
  memoryId: string,
  ctx: ForgetContext,
): Promise<void> {
  const memory = await ctx.cosmos.read<Memory>(
    'memories',
    memoryId,
    tenantId,
  );
  if (!memory) throw new Error(`Memory ${memoryId} not found`);

  // Soft delete — mark as not latest with strength 0
  memory.isLatest = false;
  memory.strength = 0;
  memory.updatedAt = new Date().toISOString();
  await ctx.cosmos.update('memories', memory);

  // Remove from search index
  await ctx.search.deleteDocument(memoryId);

  // Audit
  const audit: AuditEntry = {
    id: nanoid(),
    tenantId,
    timestamp: new Date().toISOString(),
    operation: 'forget',
    functionId: 'forgetMemory',
    targetIds: [memoryId],
    details: { title: memory.title },
  };
  await ctx.blobStorage.writeAuditEntry(tenantId, audit);
}
