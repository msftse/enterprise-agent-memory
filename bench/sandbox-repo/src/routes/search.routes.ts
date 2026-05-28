import type { FastifyInstance } from 'fastify';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { SearchRequest } from '../types/api.js';
import { hybridSearch } from '../engine/search.js';
import { nanoid } from 'nanoid';

export function registerSearchRoutes(
  app: FastifyInstance,
  openai: AzureOpenAIAdapter,
  search: AISearchAdapter,
  cosmos: CosmosAdapter,
): void {
  // POST /api/v1/search — hybrid search across memories and observations
  app.post<{ Body: SearchRequest }>('/api/v1/search', async (request, reply) => {
    const tenantId = request.tenantId;
    const body = request.body;

    const results = await hybridSearch(tenantId, body, { openai, search, cosmos });

    reply.send({
      data: results,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
    });
  });
}
