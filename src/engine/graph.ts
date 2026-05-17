import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { BlobStorageAdapter } from '../adapters/blob-storage.adapter.js';
import type {
  GraphNode,
  GraphEdge,
  GraphQueryResult,
} from '../types/models.js';
import { nanoid } from 'nanoid';

export interface GraphContext {
  cosmos: CosmosAdapter;
  openai: AzureOpenAIAdapter;
  blobStorage: BlobStorageAdapter;
}

export async function createGraphNode(
  tenantId: string,
  node: Omit<GraphNode, 'id' | 'tenantId' | 'createdAt'>,
  ctx: GraphContext,
): Promise<GraphNode> {
  const fullNode: GraphNode = {
    id: nanoid(),
    tenantId,
    createdAt: new Date().toISOString(),
    ...node,
  };
  await ctx.cosmos.create('graph-nodes', fullNode);
  return fullNode;
}

export async function createGraphEdge(
  tenantId: string,
  edge: Omit<GraphEdge, 'id' | 'tenantId' | 'createdAt'>,
  ctx: GraphContext,
): Promise<GraphEdge> {
  const fullEdge: GraphEdge = {
    id: nanoid(),
    tenantId,
    createdAt: new Date().toISOString(),
    ...edge,
  };
  await ctx.cosmos.create('graph-edges', fullEdge);
  return fullEdge;
}

export async function traverseGraph(
  tenantId: string,
  startNodeId: string,
  options: {
    direction?: 'outbound' | 'inbound' | 'both';
    maxDepth?: number;
    edgeTypes?: string[];
  },
  ctx: GraphContext,
): Promise<GraphQueryResult> {
  const maxDepth = options.maxDepth ?? 2;
  const direction = options.direction ?? 'both';
  const visited = new Set<string>();
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];

  async function walk(nodeId: string, depth: number): Promise<void> {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = await ctx.cosmos.read<GraphNode>(
      'graph-nodes',
      nodeId,
      tenantId,
    );
    if (!node) return;
    allNodes.push(node);

    // Find connected edges
    let edgeQuery = '';
    const params: Array<{ name: string; value: string }> = [
      { name: '@tenantId', value: tenantId },
      { name: '@nodeId', value: nodeId },
    ];

    if (direction === 'outbound') {
      edgeQuery =
        'SELECT * FROM c WHERE c.tenantId = @tenantId AND c.sourceNodeId = @nodeId';
    } else if (direction === 'inbound') {
      edgeQuery =
        'SELECT * FROM c WHERE c.tenantId = @tenantId AND c.targetNodeId = @nodeId';
    } else {
      edgeQuery =
        'SELECT * FROM c WHERE c.tenantId = @tenantId AND (c.sourceNodeId = @nodeId OR c.targetNodeId = @nodeId)';
    }

    if (options.edgeTypes?.length) {
      edgeQuery += ` AND c.type IN (${options.edgeTypes.map((_, i) => `@et${i}`).join(',')})`;
      options.edgeTypes.forEach((et, i) =>
        params.push({ name: `@et${i}`, value: et }),
      );
    }

    const edges = await ctx.cosmos.query<GraphEdge>('graph-edges', {
      query: edgeQuery,
      parameters: params,
    });

    for (const edge of edges) {
      allEdges.push(edge);
      const nextNodeId =
        edge.sourceNodeId === nodeId
          ? edge.targetNodeId
          : edge.sourceNodeId;
      await walk(nextNodeId, depth + 1);
    }
  }

  await walk(startNodeId, 0);

  return { nodes: allNodes, edges: allEdges, depth: maxDepth };
}

// LLM-based entity extraction from observation text with deduplication
export async function extractEntities(
  tenantId: string,
  text: string,
  sourceObservationId: string,
  ctx: GraphContext,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const extracted = await ctx.openai.extractGraphEntities(text);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeNameToId = new Map<string, string>();

  for (const n of extracted.nodes) {
    // Deduplicate: check if a node with the same name and type already exists
    const existing = await findNodeByName(tenantId, n.name, n.type, ctx);
    if (existing) {
      // Merge source observation ID into existing node
      if (!existing.sourceObservationIds.includes(sourceObservationId)) {
        existing.sourceObservationIds.push(sourceObservationId);
        existing.updatedAt = new Date().toISOString();
        await ctx.cosmos.update('graph-nodes', existing);
      }
      nodes.push(existing);
      nodeNameToId.set(n.name, existing.id);
    } else {
      const node = await createGraphNode(
        tenantId,
        {
          type: n.type as any,
          name: n.name,
          properties: {},
          sourceObservationIds: [sourceObservationId],
        },
        ctx,
      );
      nodes.push(node);
      nodeNameToId.set(n.name, node.id);
    }
  }

  for (const e of extracted.edges) {
    const sourceId = nodeNameToId.get(e.source);
    const targetId = nodeNameToId.get(e.target);
    if (sourceId && targetId) {
      // Deduplicate: check if this edge already exists
      const existingEdge = await findEdge(tenantId, sourceId, targetId, e.type, ctx);
      if (existingEdge) {
        if (!existingEdge.sourceObservationIds.includes(sourceObservationId)) {
          existingEdge.sourceObservationIds.push(sourceObservationId);
          existingEdge.weight = Math.min(10, existingEdge.weight + 0.5);
          await ctx.cosmos.update('graph-edges', existingEdge);
        }
        edges.push(existingEdge);
      } else {
        const edge = await createGraphEdge(
          tenantId,
          {
            type: e.type as any,
            sourceNodeId: sourceId,
            targetNodeId: targetId,
            weight: 1.0,
            sourceObservationIds: [sourceObservationId],
          },
          ctx,
        );
        edges.push(edge);
      }
    }
  }

  return { nodes, edges };
}

async function findNodeByName(
  tenantId: string,
  name: string,
  type: string,
  ctx: GraphContext,
): Promise<GraphNode | null> {
  const results = await ctx.cosmos.query<GraphNode>('graph-nodes', {
    query: 'SELECT * FROM c WHERE c.tenantId = @tenantId AND c.name = @name AND c.type = @type',
    parameters: [
      { name: '@tenantId', value: tenantId },
      { name: '@name', value: name },
      { name: '@type', value: type },
    ],
  });
  return results[0] ?? null;
}

async function findEdge(
  tenantId: string,
  sourceNodeId: string,
  targetNodeId: string,
  type: string,
  ctx: GraphContext,
): Promise<GraphEdge | null> {
  const results = await ctx.cosmos.query<GraphEdge>('graph-edges', {
    query: 'SELECT * FROM c WHERE c.tenantId = @tenantId AND c.sourceNodeId = @src AND c.targetNodeId = @tgt AND c.type = @type',
    parameters: [
      { name: '@tenantId', value: tenantId },
      { name: '@src', value: sourceNodeId },
      { name: '@tgt', value: targetNodeId },
      { name: '@type', value: type },
    ],
  });
  return results[0] ?? null;
}
