import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Shared mock functions ----
const mockItemCreate = vi.fn();
const mockItemRead = vi.fn();
const mockItemReplace = vi.fn();
const mockItemDelete = vi.fn();
const mockItemPatch = vi.fn();
const mockQueryFetchAll = vi.fn();
const mockGetDatabaseAccount = vi.fn();

const mockItem = vi.fn(() => ({
  read: mockItemRead,
  replace: mockItemReplace,
  delete: mockItemDelete,
  patch: mockItemPatch,
}));

const mockContainerQuery = vi.fn(() => ({ fetchAll: mockQueryFetchAll }));

const mockContainer = {
  items: {
    create: mockItemCreate,
    query: mockContainerQuery,
  },
  item: mockItem,
};

// ---- Azure SDK mocks ----
vi.mock('@azure/cosmos', () => ({
  CosmosClient: vi.fn(() => ({
    databases: {
      createIfNotExists: vi.fn().mockResolvedValue({
        database: {
          containers: {
            createIfNotExists: vi.fn().mockResolvedValue({
              container: mockContainer,
            }),
          },
        },
      }),
    },
    getDatabaseAccount: mockGetDatabaseAccount,
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

vi.mock('../../config/azure.config.js', () => ({
  getConfig: vi.fn(() => ({
    COSMOS_ENDPOINT: 'https://test.documents.azure.com:443/',
    COSMOS_DATABASE: 'testdb',
  })),
}));

import { CosmosAdapter } from '../../adapters/cosmos.adapter.js';

describe('CosmosAdapter', () => {
  let adapter: CosmosAdapter;

  beforeEach(() => {
    // Clear call history but keep implementations intact
    [
      mockItemCreate, mockItemRead, mockItemReplace,
      mockItemDelete, mockItemPatch, mockQueryFetchAll, mockGetDatabaseAccount,
      mockItem, mockContainerQuery,
    ].forEach((fn) => fn.mockClear());

    adapter = new CosmosAdapter();
  });

  describe('create', () => {
    it('creates an item and returns it', async () => {
      const item = { id: 'item-1', tenantId: 'tenant-1', name: 'test' };
      mockItemCreate.mockResolvedValueOnce({ resource: item });

      const result = await adapter.create('sessions', item);

      expect(result).toEqual(item);
      expect(mockItemCreate).toHaveBeenCalledWith(item);
    });
  });

  describe('read', () => {
    it('returns item when found', async () => {
      const item = { id: 'item-1', tenantId: 'tenant-1' };
      mockItemRead.mockResolvedValueOnce({ resource: item });

      const result = await adapter.read('sessions', 'item-1', 'tenant-1');

      expect(result).toEqual(item);
      expect(mockItem).toHaveBeenCalledWith('item-1', 'tenant-1');
    });

    it('returns null for 404 errors', async () => {
      const error = new Error('Not found');
      (error as any).code = 404;
      mockItemRead.mockRejectedValueOnce(error);

      const result = await adapter.read('sessions', 'missing', 'tenant-1');

      expect(result).toBeNull();
    });

    it('returns null when resource is undefined', async () => {
      mockItemRead.mockResolvedValueOnce({ resource: undefined });

      const result = await adapter.read('sessions', 'item-1', 'tenant-1');

      expect(result).toBeNull();
    });

    it('throws on non-404 errors', async () => {
      mockItemRead.mockRejectedValueOnce(new Error('Internal error'));

      await expect(
        adapter.read('sessions', 'item-1', 'tenant-1'),
      ).rejects.toThrow('Internal error');
    });
  });

  describe('update', () => {
    it('replaces the item', async () => {
      const item = { id: 'item-1', tenantId: 'tenant-1', updated: true };
      mockItemReplace.mockResolvedValueOnce({ resource: item });

      const result = await adapter.update('sessions', item);

      expect(result).toEqual(item);
      expect(mockItem).toHaveBeenCalledWith('item-1', 'tenant-1');
      expect(mockItemReplace).toHaveBeenCalledWith(item);
    });
  });

  describe('delete', () => {
    it('deletes the item by id and tenantId', async () => {
      mockItemDelete.mockResolvedValueOnce(undefined);

      await adapter.delete('sessions', 'item-1', 'tenant-1');

      expect(mockItem).toHaveBeenCalledWith('item-1', 'tenant-1');
      expect(mockItemDelete).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    it('executes parameterized query and returns results', async () => {
      const resources = [{ id: '1' }, { id: '2' }];
      mockQueryFetchAll.mockResolvedValueOnce({ resources });

      const result = await adapter.query('sessions', {
        query: 'SELECT * FROM c WHERE c.tenantId = @tenantId',
        parameters: [{ name: '@tenantId', value: 'tenant-1' }],
      });

      expect(result).toEqual(resources);
      expect(mockContainerQuery).toHaveBeenCalledWith({
        query: 'SELECT * FROM c WHERE c.tenantId = @tenantId',
        parameters: [{ name: '@tenantId', value: 'tenant-1' }],
      });
    });
  });

  describe('list', () => {
    it('returns paginated results with total count', async () => {
      mockQueryFetchAll
        .mockResolvedValueOnce({ resources: [3] }) // count query
        .mockResolvedValueOnce({ resources: [{ id: '1' }, { id: '2' }] }); // items query

      const result = await adapter.list('sessions', 'tenant-1', { limit: 2, offset: 0 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
    });

    it('applies default limit and offset', async () => {
      mockQueryFetchAll
        .mockResolvedValueOnce({ resources: [0] })
        .mockResolvedValueOnce({ resources: [] });

      const result = await adapter.list('sessions', 'tenant-1');

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('includes tenantId in query parameters for tenant isolation', async () => {
      mockQueryFetchAll
        .mockResolvedValueOnce({ resources: [1] })
        .mockResolvedValueOnce({ resources: [{ id: 'x' }] });

      await adapter.list('sessions', 'tenant-A');

      // The count query should filter by tenantId
      expect(mockContainerQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: expect.arrayContaining([
            { name: '@tenantId', value: 'tenant-A' },
          ]),
        }),
      );
    });
  });

  describe('purgeContainer', () => {
    it('deletes all items for a tenant and returns count', async () => {
      mockQueryFetchAll.mockResolvedValueOnce({
        resources: [{ id: 'a' }, { id: 'b' }],
      });
      mockItemDelete.mockResolvedValue(undefined);

      const count = await adapter.purgeContainer('sessions', 'tenant-1');

      expect(count).toBe(2);
      expect(mockItemDelete).toHaveBeenCalledTimes(2);
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when getDatabaseAccount succeeds', async () => {
      mockGetDatabaseAccount.mockResolvedValueOnce({});

      const result = await adapter.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy on connection error', async () => {
      mockGetDatabaseAccount.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await adapter.healthCheck();

      expect(result.status).toBe('unhealthy');
    });
  });

  describe('incrementMemoryRecallCount', () => {
    it('issues a JSON-Patch incr op on the memory item', async () => {
      mockItemPatch.mockResolvedValueOnce({});
      await adapter.incrementMemoryRecallCount('mem-1', 'pilot');
      expect(mockItem).toHaveBeenCalledWith('mem-1', 'pilot');
      expect(mockItemPatch).toHaveBeenCalledWith([
        { op: 'incr', path: '/recallCount', value: 1 },
      ]);
    });

    it('falls back to set when incr fails (legacy memory without recallCount)', async () => {
      const err: any = new Error('AbsolutePath cannot be used to update the document');
      err.code = 400;
      mockItemPatch.mockRejectedValueOnce(err);
      mockItemPatch.mockResolvedValueOnce({});
      await adapter.incrementMemoryRecallCount('legacy-mem', 'pilot');
      expect(mockItemPatch).toHaveBeenCalledTimes(2);
      expect(mockItemPatch).toHaveBeenLastCalledWith([
        { op: 'set', path: '/recallCount', value: 1 },
      ]);
    });
  });
});
