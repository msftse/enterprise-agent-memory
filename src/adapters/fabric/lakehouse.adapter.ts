// ---------------------------------------------------------------------------
// Microsoft Fabric Lakehouse Adapter
// Syncs agent memory data to OneLake as Parquet files (Delta table compatible)
// Uses ADLS Gen2 REST API over OneLake endpoint
// ---------------------------------------------------------------------------

import { DataLakeServiceClient } from '@azure/storage-file-datalake';
import { DefaultAzureCredential } from '@azure/identity';
import { getConfig } from '../../config/azure.config.js';

const TABLE_PATHS = {
  sessions: 'Tables/sessions',
  observations: 'Tables/observations',
  memories: 'Tables/memories',
  graph_nodes: 'Tables/graph_nodes',
  graph_edges: 'Tables/graph_edges',
} as const;

interface FabricRow {
  [key: string]: string | number | boolean | null;
}

export class FabricLakehouseAdapter {
  private client: DataLakeServiceClient | null = null;
  private available = false;

  get isAvailable(): boolean {
    const config = getConfig();
    this.available = !!(
      config.FABRIC_ENABLED &&
      config.FABRIC_ONELAKE_ENDPOINT &&
      config.FABRIC_WORKSPACE_ID &&
      config.FABRIC_LAKEHOUSE_ID
    );
    return this.available;
  }

  private getClient(): DataLakeServiceClient {
    if (!this.client) {
      const config = getConfig();
      if (!config.FABRIC_ONELAKE_ENDPOINT) {
        throw new Error('Fabric OneLake endpoint not configured');
      }
      const credential = new DefaultAzureCredential();
      this.client = new DataLakeServiceClient(
        config.FABRIC_ONELAKE_ENDPOINT,
        credential,
      );
    }
    return this.client;
  }

  private getFilesystemName(): string {
    const config = getConfig();
    // OneLake filesystem = workspaceId
    return config.FABRIC_WORKSPACE_ID!;
  }

  private getLakehousePath(): string {
    const config = getConfig();
    return config.FABRIC_LAKEHOUSE_ID!;
  }

  /**
   * Write rows as newline-delimited JSON (NDJSON) to OneLake Files section.
   * Fabric auto-discovers these as tables via shortcuts or notebook load.
   */
  async writeRows(
    table: keyof typeof TABLE_PATHS,
    rows: FabricRow[],
    partitionKey?: string,
  ): Promise<{ path: string; rowCount: number }> {
    if (!this.isAvailable) {
      throw new Error('Fabric Lakehouse not configured');
    }

    const client = this.getClient();
    const fsClient = client.getFileSystemClient(this.getFilesystemName());
    const lakehousePath = this.getLakehousePath();

    // Write to Files/ as NDJSON (Spark-compatible)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const partition = partitionKey ? `/${partitionKey}` : '';
    const filePath = `${lakehousePath}/Files/${table}${partition}/${timestamp}.jsonl`;

    const fileClient = fsClient.getFileClient(filePath);
    const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    const buffer = Buffer.from(ndjson, 'utf-8');

    await fileClient.create();
    await fileClient.append(buffer, 0, buffer.length);
    await fileClient.flush(buffer.length);

    return { path: filePath, rowCount: rows.length };
  }

  /**
   * Flatten a session record for Fabric Delta table
   */
  flattenSession(session: Record<string, unknown>): FabricRow {
    return {
      id: session.id as string,
      tenant_id: session.tenantId as string,
      project: (session.project as string) ?? null,
      started_at: session.startedAt as string,
      ended_at: (session.endedAt as string) ?? null,
      status: session.status as string,
      observation_count: session.observationCount as number,
      model: (session.model as string) ?? null,
      summary: (session.summary as string) ?? null,
      tags: JSON.stringify(session.tags ?? []),
    };
  }

  /**
   * Flatten an observation for Fabric Delta table
   */
  flattenObservation(obs: Record<string, unknown>): FabricRow {
    return {
      id: obs.id as string,
      tenant_id: obs.tenantId as string,
      session_id: obs.sessionId as string,
      timestamp: obs.timestamp as string,
      type: obs.type as string,
      title: (obs.title as string) ?? null,
      content: (obs.content as string) ?? (obs.narrative as string) ?? null,
      narrative: (obs.narrative as string) ?? null,
      importance: obs.importance as number,
      confidence: (obs.confidence as number) ?? null,
      concepts: JSON.stringify(obs.concepts ?? []),
      files: JSON.stringify(obs.files ?? []),
      facts: JSON.stringify(obs.facts ?? []),
    };
  }

  /**
   * Flatten a memory for Fabric Delta table
   */
  flattenMemory(memory: Record<string, unknown>): FabricRow {
    return {
      id: memory.id as string,
      tenant_id: memory.tenantId as string,
      created_at: memory.createdAt as string,
      updated_at: memory.updatedAt as string,
      type: memory.type as string,
      title: (memory.title as string) ?? null,
      content: (memory.content as string) ?? null,
      strength: memory.strength as number,
      version: memory.version as number,
      is_latest: memory.isLatest as boolean,
      importance: (memory.importance as number) ?? null,
      concepts: JSON.stringify(memory.concepts ?? []),
      files: JSON.stringify(memory.files ?? []),
      session_ids: JSON.stringify(memory.sessionIds ?? []),
    };
  }

  /**
   * Flatten a graph node for Fabric Delta table
   */
  flattenGraphNode(node: Record<string, unknown>): FabricRow {
    return {
      id: node.id as string,
      tenant_id: node.tenantId as string,
      type: node.type as string,
      name: node.name as string,
      created_at: node.createdAt as string,
      properties: JSON.stringify(node.properties ?? {}),
      aliases: JSON.stringify(node.aliases ?? []),
    };
  }

  /**
   * Flatten a graph edge for Fabric Delta table
   */
  flattenGraphEdge(edge: Record<string, unknown>): FabricRow {
    return {
      id: edge.id as string,
      tenant_id: edge.tenantId as string,
      type: edge.type as string,
      source_node_id: edge.sourceNodeId as string,
      target_node_id: edge.targetNodeId as string,
      weight: edge.weight as number,
      created_at: edge.createdAt as string,
    };
  }

  /**
   * Full sync — pull all data from Cosmos and write to Lakehouse
   */
  async fullSync(
    cosmos: {
      query: <T>(container: string, query: { query: string }) => Promise<T[]>;
    },
    tenantId?: string,
  ): Promise<{
    sessions: number;
    observations: number;
    memories: number;
    graphNodes: number;
    graphEdges: number;
  }> {
    const filter = tenantId
      ? `WHERE c.tenantId = '${tenantId}'`
      : '';

    const [sessions, observations, memories, graphNodes, graphEdges] =
      await Promise.all([
        cosmos.query<Record<string, unknown>>('sessions', {
          query: `SELECT * FROM c ${filter}`,
        }),
        cosmos.query<Record<string, unknown>>('observations', {
          query: `SELECT * FROM c ${filter}`,
        }),
        cosmos.query<Record<string, unknown>>('memories', {
          query: `SELECT * FROM c ${filter}`,
        }),
        cosmos.query<Record<string, unknown>>('graph-nodes', {
          query: `SELECT * FROM c ${filter}`,
        }),
        cosmos.query<Record<string, unknown>>('graph-edges', {
          query: `SELECT * FROM c ${filter}`,
        }),
      ]);

    const results = { sessions: 0, observations: 0, memories: 0, graphNodes: 0, graphEdges: 0 };
    const partition = tenantId ?? 'all';

    if (sessions.length > 0) {
      const r = await this.writeRows('sessions', sessions.map((s) => this.flattenSession(s)), partition);
      results.sessions = r.rowCount;
    }
    if (observations.length > 0) {
      const r = await this.writeRows('observations', observations.map((o) => this.flattenObservation(o)), partition);
      results.observations = r.rowCount;
    }
    if (memories.length > 0) {
      const r = await this.writeRows('memories', memories.map((m) => this.flattenMemory(m)), partition);
      results.memories = r.rowCount;
    }
    if (graphNodes.length > 0) {
      const r = await this.writeRows('graph_nodes', graphNodes.map((n) => this.flattenGraphNode(n)), partition);
      results.graphNodes = r.rowCount;
    }
    if (graphEdges.length > 0) {
      const r = await this.writeRows('graph_edges', graphEdges.map((e) => this.flattenGraphEdge(e)), partition);
      results.graphEdges = r.rowCount;
    }

    return results;
  }

  async healthCheck(): Promise<{ status: string; workspace?: string }> {
    if (!this.isAvailable) {
      return { status: 'not_configured' };
    }
    try {
      const client = this.getClient();
      const fsClient = client.getFileSystemClient(this.getFilesystemName());
      // Try listing paths to verify connectivity
      const iter = fsClient.listPaths({ path: this.getLakehousePath(), maxResults: 1 });
      await iter.next();
      return { status: 'healthy', workspace: this.getFilesystemName() };
    } catch {
      return { status: 'unhealthy' };
    }
  }
}
