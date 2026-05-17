import { CosmosClient, type Database, type Container, type ItemDefinition, type JSONValue } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { getConfig } from '../config/azure.config.js';

const CONTAINERS = [
  { id: 'sessions', partitionKey: '/tenantId' },
  { id: 'observations', partitionKey: '/tenantId' },
  { id: 'memories', partitionKey: '/tenantId' },
  { id: 'graph-nodes', partitionKey: '/tenantId' },
  { id: 'graph-edges', partitionKey: '/tenantId' },
  { id: 'audit-entries', partitionKey: '/tenantId' },
] as const;

export class CosmosAdapter {
  private client: CosmosClient;
  private _db: Database | null = null;
  private containers = new Map<string, Container>();
  private initialized = false;

  constructor() {
    const config = getConfig();
    const credential = new DefaultAzureCredential();
    this.client = new CosmosClient({
      endpoint: config.COSMOS_ENDPOINT,
      aadCredentials: credential,
    });
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const config = getConfig();

    const { database } = await this.client.databases.createIfNotExists({
      id: config.COSMOS_DATABASE,
    });
    this._db = database;

    for (const def of CONTAINERS) {
      const { container } = await database.containers.createIfNotExists({
        id: def.id,
        partitionKey: { paths: [def.partitionKey] },
      });
      this.containers.set(def.id, container);
    }

    this.initialized = true;
  }

  private getContainer(name: string): Container {
    const c = this.containers.get(name);
    if (!c) throw new Error(`Container '${name}' not initialized`);
    return c;
  }

  get database(): Database | null {
    return this._db;
  }

  async create<T extends ItemDefinition & { id: string; tenantId: string }>(
    containerName: string,
    item: T,
  ): Promise<T> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    const { resource } = await container.items.create(item);
    return resource as T;
  }

  async read<T extends ItemDefinition>(
    containerName: string,
    id: string,
    tenantId: string,
  ): Promise<T | null> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    try {
      const { resource } = await container.item(id, tenantId).read<T>();
      return resource ?? null;
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: number }).code === 404) {
        return null;
      }
      throw err;
    }
  }

  async update<T extends ItemDefinition & { id: string; tenantId: string }>(
    containerName: string,
    item: T,
  ): Promise<T> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    const { resource } = await container.item(item.id, item.tenantId).replace(item);
    return resource as unknown as T;
  }

  async delete(
    containerName: string,
    id: string,
    tenantId: string,
  ): Promise<void> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    await container.item(id, tenantId).delete();
  }

  async query<T>(
    containerName: string,
    querySpec: {
      query: string;
      parameters: Array<{ name: string; value: JSONValue }>;
    },
  ): Promise<T[]> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    const { resources } = await container.items.query<T>(querySpec).fetchAll();
    return resources;
  }

  async list<T>(
    containerName: string,
    tenantId: string,
    options?: {
      offset?: number;
      limit?: number;
      orderBy?: string;
      orderDir?: 'ASC' | 'DESC';
    },
  ): Promise<{ items: T[]; total: number }> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const orderBy = options?.orderBy ?? '_ts';
    const orderDir = options?.orderDir ?? 'DESC';

    const countResult = await container.items
      .query<{ count: number }>({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tenantId',
        parameters: [{ name: '@tenantId', value: tenantId }],
      })
      .fetchAll();
    const total = (countResult.resources[0] as unknown as number) ?? 0;

    const { resources } = await container.items
      .query<T>({
        query: `SELECT * FROM c WHERE c.tenantId = @tenantId ORDER BY c.${orderBy} ${orderDir} OFFSET @offset LIMIT @limit`,
        parameters: [
          { name: '@tenantId', value: tenantId },
          { name: '@offset', value: offset },
          { name: '@limit', value: limit },
        ],
      })
      .fetchAll();

    return { items: resources, total };
  }

  async purgeContainer(
    containerName: string,
    tenantId: string,
  ): Promise<number> {
    await this.ensureInitialized();
    const container = this.getContainer(containerName);
    const { resources } = await container.items
      .query<{ id: string }>({
        query: 'SELECT c.id FROM c WHERE c.tenantId = @tenantId',
        parameters: [{ name: '@tenantId', value: tenantId }],
      })
      .fetchAll();

    for (const item of resources) {
      await container.item(item.id, tenantId).delete();
    }
    return resources.length;
  }

  async healthCheck(): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.client.getDatabaseAccount();
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch {
      return { status: 'unhealthy', latencyMs: Date.now() - start };
    }
  }
}
