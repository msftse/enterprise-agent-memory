import type { FastifyInstance } from 'fastify';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type { TraverseGraphRequest } from '../types/api.js';
import type { GraphNode, GraphEdge } from '../types/models.js';
import { createGraphNode, createGraphEdge, traverseGraph } from '../engine/graph.js';
import { nanoid } from 'nanoid';

export function registerGraphRoutes(
  app: FastifyInstance,
  cosmos: CosmosAdapter,
  openai: AzureOpenAIAdapter,
  blobStorage: BlobStorageAdapter,
): void {
  const ctx = { cosmos, openai, blobStorage };

  // POST /api/v1/graph/nodes — create a graph node
  app.post<{ Body: Omit<GraphNode, 'id' | 'tenantId'> }>(
    '/api/v1/graph/nodes',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const node = await createGraphNode(tenantId, request.body, ctx);
      reply.code(201).send({
        data: node,
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  );

  // GET /api/v1/graph/nodes — list graph nodes
  app.get<{ Querystring: { offset?: number; limit?: number; type?: string } }>(
    '/api/v1/graph/nodes',
    async (request, reply) => {
      const { offset = 0, limit = 50, type } = request.query;
      const tenantId = request.tenantId;

      const filters: string[] = [];
      const parameters: { name: string; value: string | number }[] = [
        { name: '@tenantId', value: tenantId },
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ];

      if (type) {
        filters.push('c.type = @type');
        parameters.push({ name: '@type', value: type });
      }

      const whereExtra = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';

      const items = await cosmos.query<GraphNode>('graph-nodes', {
        query: `SELECT * FROM c WHERE c.tenantId = @tenantId${whereExtra} ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit`,
        parameters,
      });

      reply.send({
        data: { items, total: items.length, offset, limit, hasMore: items.length === limit },
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  );

  // GET /api/v1/graph/nodes/:id — get a single graph node
  app.get<{ Params: { id: string } }>('/api/v1/graph/nodes/:id', async (request, reply) => {
    const node = await cosmos.read<GraphNode>(
      'graph-nodes',
      request.params.id,
      request.tenantId,
    );
    if (!node) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Graph node not found', status: 404 },
      });
    }
    reply.send({
      data: node,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
    });
  });

  // POST /api/v1/graph/edges — create a graph edge
  app.post<{ Body: Omit<GraphEdge, 'id' | 'tenantId'> }>(
    '/api/v1/graph/edges',
    async (request, reply) => {
      const tenantId = request.tenantId;
      const edge = await createGraphEdge(tenantId, request.body, ctx);
      reply.code(201).send({
        data: edge,
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  );

  // GET /api/v1/graph/edges — list graph edges
  app.get<{ Querystring: { offset?: number; limit?: number; nodeId?: string } }>(
    '/api/v1/graph/edges',
    async (request, reply) => {
      const { offset = 0, limit = 50, nodeId } = request.query;
      const tenantId = request.tenantId;

      const filters: string[] = [];
      const parameters: { name: string; value: string | number }[] = [
        { name: '@tenantId', value: tenantId },
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ];

      if (nodeId) {
        filters.push('(c.sourceNodeId = @nodeId OR c.targetNodeId = @nodeId)');
        parameters.push({ name: '@nodeId', value: nodeId });
      }

      const whereExtra = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';

      const items = await cosmos.query<GraphEdge>('graph-edges', {
        query: `SELECT * FROM c WHERE c.tenantId = @tenantId${whereExtra} ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit`,
        parameters,
      });

      reply.send({
        data: { items, total: items.length, offset, limit, hasMore: items.length === limit },
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
      });
    },
  );

  // POST /api/v1/graph/traverse — traverse the knowledge graph
  app.post<{ Body: TraverseGraphRequest }>('/api/v1/graph/traverse', async (request, reply) => {
    const tenantId = request.tenantId;
    const { startNodeId, ...options } = request.body;
    const result = await traverseGraph(tenantId, startNodeId, options, ctx);
    reply.send({
      data: result,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId },
    });
  });
}
