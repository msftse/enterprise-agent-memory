import type { FastifyInstance } from 'fastify';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type { TenantPurgeResponse } from '../types/api.js';
import { requireRole } from '../middleware/auth.middleware.js';
import { nanoid } from 'nanoid';

async function countByTenant(cosmos: CosmosAdapter, container: string, tenantId: string): Promise<number> {
  const result = await cosmos.query<number>(container, {
    query: 'SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tenantId',
    parameters: [{ name: '@tenantId', value: tenantId }],
  });
  return result[0] ?? 0;
}

export function registerAdminRoutes(
  app: FastifyInstance,
  cosmos: CosmosAdapter,
  search: AISearchAdapter,
  blobStorage: BlobStorageAdapter,
): void {
  // GET /api/v1/health — public health check (no auth required)
  app.get('/api/v1/health', async (_request, reply) => {
    const [cosmosResult, searchResult, blobResult] = await Promise.allSettled([
      cosmos.healthCheck(),
      search.healthCheck(),
      blobStorage.healthCheck(),
    ]);

    const cosmosHealth =
      cosmosResult.status === 'fulfilled' && cosmosResult.value.status === 'healthy'
        ? 'healthy'
        : 'unhealthy';
    const searchHealth =
      searchResult.status === 'fulfilled' && searchResult.value.status === 'healthy'
        ? 'healthy'
        : 'unhealthy';
    const blobHealth =
      blobResult.status === 'fulfilled' && blobResult.value.status === 'healthy'
        ? 'healthy'
        : 'unhealthy';

    const overall =
      cosmosHealth === 'healthy' && searchHealth === 'healthy' && blobHealth === 'healthy'
        ? 'healthy'
        : 'degraded';

    const status = overall === 'healthy' ? 200 : 503;
    reply.code(status).send({
      data: {
        status: overall,
        services: {
          cosmos: cosmosHealth,
          search: searchHealth,
          blob: blobHealth,
        },
        timestamp: new Date().toISOString(),
      },
    });
  });

  // GET /api/v1/admin/metrics — basic tenant stats (admin only)
  app.get('/api/v1/admin/metrics', {
    preHandler: requireRole('admin'),
    handler: async (request, reply) => {
      const tenantId = request.tenantId;

      const [sessions, observations, memories, graphNodes] = await Promise.all([
        countByTenant(cosmos, 'sessions', tenantId),
        countByTenant(cosmos, 'observations', tenantId),
        countByTenant(cosmos, 'memories', tenantId),
        countByTenant(cosmos, 'graph-nodes', tenantId),
      ]);

      reply.send({
        data: { tenantId, sessions, observations, memories, graphNodes },
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  });

  // DELETE /api/v1/admin/tenant-data — GDPR purge (admin only)
  app.delete('/api/v1/admin/tenant-data', {
    preHandler: requireRole('admin'),
    handler: async (request, reply) => {
      const tenantId = request.tenantId;

      // Delete from all Cosmos containers
      const [sessions, observations, memories, graphNodes, graphEdges, auditEntries] =
        await Promise.all([
          cosmos.purgeContainer('sessions', tenantId),
          cosmos.purgeContainer('observations', tenantId),
          cosmos.purgeContainer('memories', tenantId),
          cosmos.purgeContainer('graph-nodes', tenantId),
          cosmos.purgeContainer('graph-edges', tenantId),
          cosmos.purgeContainer('audit-entries', tenantId),
        ]);

      // Delete from AI Search index
      await search.purgeTenant(tenantId);

      // Delete from Blob Storage
      await blobStorage.purgeTenant(tenantId);

      const response: TenantPurgeResponse = {
        deletedCounts: {
          sessions,
          observations,
          memories,
          graphNodes,
          graphEdges,
          auditEntries,
        },
      };

      reply.send({
        data: response,
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  });
}
