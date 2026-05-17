import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type {
  RawObservation,
  CompressedObservation,
  AuditEntry,
} from '../types/models.js';
import { compressObservation } from './compress.js';
import { nanoid } from 'nanoid';

export interface ObserveContext {
  cosmos: CosmosAdapter;
  openai: AzureOpenAIAdapter;
  search: AISearchAdapter;
  blobStorage: BlobStorageAdapter;
}

export async function captureObservation(
  raw: RawObservation,
  ctx: ObserveContext,
): Promise<CompressedObservation> {
  // 1. Archive raw observation to blob storage
  await ctx.blobStorage.writeRawObservation(
    raw.tenantId,
    raw.sessionId,
    raw.id,
    raw,
  );

  // 2. Compress via LLM
  const compressed = await compressObservation(raw, ctx.openai);

  // 3. Generate embedding
  const embeddingText = `${compressed.title}. ${compressed.content} ${compressed.concepts.join(', ')}`;
  const embedding = await ctx.openai.embed(embeddingText);

  const observation: CompressedObservation = { ...compressed, embedding };

  // 4. Store in Cosmos DB
  await ctx.cosmos.create('observations', observation);

  // 5. Index in AI Search
  await ctx.search.indexDocument({
    id: observation.id,
    tenantId: observation.tenantId,
    docType: 'observation',
    sessionId: observation.sessionId,
    title: observation.title,
    content: observation.content,
    concepts: observation.concepts,
    files: observation.files,
    type: observation.type,
    importance: observation.importance,
    timestamp: observation.timestamp,
    embedding,
  });

  // 6. Update session observation count
  const session = await ctx.cosmos.read<any>(
    'sessions',
    raw.sessionId,
    raw.tenantId,
  );
  if (session) {
    session.observationCount = (session.observationCount ?? 0) + 1;
    await ctx.cosmos.update('sessions', session);
  }

  // 7. Write audit entry
  const audit: AuditEntry = {
    id: nanoid(),
    tenantId: raw.tenantId,
    timestamp: new Date().toISOString(),
    operation: 'observe',
    userId: raw.tenantId,
    functionId: 'captureObservation',
    targetIds: [observation.id],
    details: { sessionId: raw.sessionId, type: observation.type },
  };
  await ctx.blobStorage.writeAuditEntry(raw.tenantId, audit);

  return observation;
}
