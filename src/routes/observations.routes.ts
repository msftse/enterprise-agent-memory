import type { FastifyInstance } from 'fastify';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type { CaptureObservationRequest } from '../types/api.js';
import type { RawObservation, CompressedObservation } from '../types/models.js';
import { captureObservation } from '../engine/observe.js';
import { nanoid } from 'nanoid';

/** Backfill `content` from `narrative` for documents written before the rename. */
function normalizeObservation(obs: CompressedObservation): CompressedObservation {
  if (!obs.content && obs.narrative) {
    obs.content = obs.narrative;
  }
  return obs;
}

export function registerObservationRoutes(
  app: FastifyInstance,
  cosmos: CosmosAdapter,
  openai: AzureOpenAIAdapter,
  search: AISearchAdapter,
  blobStorage: BlobStorageAdapter,
): void {
  // POST /api/v1/observations — capture observation
  app.post<{ Body: CaptureObservationRequest }>(
    '/api/v1/observations',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const body = request.body;

      const raw: RawObservation = {
        id: nanoid(),
        tenantId,
        sessionId: body.sessionId,
        timestamp: new Date().toISOString(),
        hookType: body.hookType as RawObservation['hookType'],
        toolName: body.toolName,
        toolInput: body.toolInput,
        toolOutput: body.toolOutput,
        userPrompt: body.userPrompt,
        assistantResponse: body.assistantResponse,
        raw: body.raw ?? body,
      };

      const compressed = await captureObservation(raw, { cosmos, openai, search, blobStorage });
      reply.code(201).send({
        data: compressed,
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  );

  // GET /api/v1/observations/:id
  app.get<{ Params: { id: string } }>('/api/v1/observations/:id', async (request, reply) => {
    const obs = await cosmos.read<CompressedObservation>(
      'observations',
      request.params.id,
      request.tenantId,
    );
    if (!obs) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Observation not found', status: 404 },
      });
    }
    reply.send({
      data: normalizeObservation(obs),
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
    });
  });

  // GET /api/v1/sessions/:sessionId/observations — list observations for a session
  app.get<{ Params: { sessionId: string }; Querystring: { offset?: number; limit?: number } }>(
    '/api/v1/sessions/:sessionId/observations',
    async (request, reply) => {
      const { offset: rawOffset = 0, limit: rawLimit = 50 } = request.query;
      const offset = Number(rawOffset);
      const limit = Number(rawLimit);
      const items = await cosmos.query<CompressedObservation>('observations', {
        query:
          'SELECT * FROM c WHERE c.tenantId = @tenantId AND c.sessionId = @sessionId ORDER BY c.timestamp DESC OFFSET @offset LIMIT @limit',
        parameters: [
          { name: '@tenantId', value: request.tenantId },
          { name: '@sessionId', value: request.params.sessionId },
          { name: '@offset', value: offset },
          { name: '@limit', value: limit },
        ],
      });
      reply.send({
        data: { items: items.map(normalizeObservation), total: items.length, offset, limit, hasMore: items.length === limit },
        meta: {
          requestId: nanoid(),
          timestamp: new Date().toISOString(),
          tenantId: request.tenantId,
        },
      });
    },
  );
}
