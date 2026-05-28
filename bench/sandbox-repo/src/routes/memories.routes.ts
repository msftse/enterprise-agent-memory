import type { FastifyInstance } from 'fastify';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type { CreateMemoryRequest, EvolveMemoryRequest, ListParams } from '../types/api.js';
import type { Memory } from '../types/models.js';
import { createMemory } from '../engine/remember.js';
import { evolveMemory } from '../engine/remember.js';
import { forgetMemory } from '../engine/forget.js';
import { nanoid } from 'nanoid';

export function registerMemoryRoutes(
  app: FastifyInstance,
  cosmos: CosmosAdapter,
  openai: AzureOpenAIAdapter,
  search: AISearchAdapter,
  blobStorage: BlobStorageAdapter,
): void {
  const ctx = { cosmos, openai, search, blobStorage };

  // POST /api/v1/memories — create a new memory
  app.post<{ Body: CreateMemoryRequest }>('/api/v1/memories', async (request, reply) => {
    const tenantId = request.tenantId;
    // Phase 2: stamp actor from the API key prefix (e.g. 'roey-abc...' → 'roey')
    const rawKey = request.headers['x-api-key'];
    const keyStr = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const actor = keyStr ? keyStr.split('-', 2)[0] || undefined : undefined;
    const memory = await createMemory(tenantId, request.body, ctx, { actor });
    reply.code(201).send({
      data: memory,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
    });
  });

  // GET /api/v1/memories — list memories (paginated)
  app.get<{ Querystring: ListParams }>('/api/v1/memories', async (request, reply) => {
    const { offset: rawOffset = 0, limit: rawLimit = 50, project, status } = request.query;
    const offset = Number(rawOffset);
    const limit = Number(rawLimit);
    const tenantId = request.tenantId;

    const filters: string[] = [];
    const parameters: { name: string; value: string | number | boolean }[] = [
      { name: '@tenantId', value: tenantId },
      { name: '@offset', value: offset },
      { name: '@limit', value: limit },
    ];

    if (project) {
      filters.push('c.project = @project');
      parameters.push({ name: '@project', value: project });
    }
    if (status === 'forgotten') {
      filters.push('c.strength = 0');
    } else {
      // By default only show latest, non-forgotten memories
      filters.push('c.isLatest = true');
    }

    const whereExtra = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';

    const items = await cosmos.query<Memory>('memories', {
      query: `SELECT * FROM c WHERE c.tenantId = @tenantId${whereExtra} ORDER BY c.updatedAt DESC OFFSET @offset LIMIT @limit`,
      parameters,
    });

    const countResult = await cosmos.query<number>('memories', {
      query: `SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tenantId${whereExtra}`,
      parameters: parameters.filter((p) => p.name !== '@offset' && p.name !== '@limit'),
    });
    const total = countResult[0] ?? 0;

    reply.send({
      data: { items, total, offset, limit, hasMore: offset + limit < total },
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
    });
  });

  // GET /api/v1/memories/:id — get a single memory
  app.get<{ Params: { id: string } }>('/api/v1/memories/:id', async (request, reply) => {
    const memory = await cosmos.read<Memory>('memories', request.params.id, request.tenantId);
    if (!memory) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Memory not found', status: 404 },
      });
    }
    reply.send({
      data: memory,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
    });
  });

  // GET /api/v1/memories/:id/versions — get version history
  app.get<{ Params: { id: string } }>('/api/v1/memories/:id/versions', async (request, reply) => {
    const tenantId = request.tenantId;
    const memory = await cosmos.read<Memory>('memories', request.params.id, tenantId);
    if (!memory) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Memory not found', status: 404 },
      });
    }

    // Walk the parentId chain to find the root, then find all versions sharing that root
    let rootId = memory.id;
    let current = memory;
    while (current.parentId) {
      rootId = current.parentId;
      const parent = await cosmos.read<Memory>('memories', current.parentId, tenantId);
      if (!parent) break;
      current = parent;
    }

    // Find all memories that are part of this version chain
    const versions = await cosmos.query<Memory>('memories', {
      query: 'SELECT * FROM c WHERE c.tenantId = @tenantId AND (c.id = @rootId OR c.parentId = @rootId) ORDER BY c.version DESC',
      parameters: [
        { name: '@tenantId', value: tenantId },
        { name: '@rootId', value: rootId },
      ],
    });

    reply.send({
      data: versions,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
    });
  });

  // PUT /api/v1/memories/:id/evolve — evolve (version) a memory
  app.put<{ Params: { id: string }; Body: EvolveMemoryRequest }>(
    '/api/v1/memories/:id/evolve',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const memoryId = request.params.id;
      const evolved = await evolveMemory(tenantId, memoryId, request.body, ctx);
      reply.send({
        data: evolved,
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  );

  // DELETE /api/v1/memories/:id — soft-delete (forget) a memory
  app.delete<{ Params: { id: string } }>('/api/v1/memories/:id', async (request, reply) => {
    const tenantId = request.tenantId;
    const memoryId = request.params.id;

    // Read before forget since forgetMemory returns void
    const memory = await cosmos.read<Memory>('memories', memoryId, tenantId);
    if (!memory) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Memory not found', status: 404 },
      });
    }

    await forgetMemory(tenantId, memoryId, ctx);
    reply.send({
      data: { id: memoryId, forgotten: true },
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
    });
  });
}
