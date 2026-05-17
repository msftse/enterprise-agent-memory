import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpload = vi.fn().mockResolvedValue(undefined);
const mockCreateIfNotExists = vi.fn().mockResolvedValue(undefined);

const mockListBlobsFlat = vi.fn().mockReturnValue({
  byPage: vi.fn(() => ({
    next: vi.fn().mockResolvedValue({ done: true }),
  })),
  [Symbol.asyncIterator]: () => ({
    next: vi.fn().mockResolvedValue({ done: true }),
  }),
});

const mockGetBlockBlobClient = vi.fn(() => ({
  upload: mockUpload,
  delete: vi.fn().mockResolvedValue(undefined),
}));

const mockGetBlobClient = vi.fn(() => ({
  downloadToBuffer: vi.fn().mockResolvedValue(Buffer.from('{}')),
}));

const mockContainerClient = {
  createIfNotExists: mockCreateIfNotExists,
  getBlockBlobClient: mockGetBlockBlobClient,
  getBlobClient: mockGetBlobClient,
  listBlobsFlat: mockListBlobsFlat,
};

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: vi.fn(() => ({
    getContainerClient: vi.fn(() => mockContainerClient),
  })),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

vi.mock('../../config/azure.config.js', () => ({
  getConfig: vi.fn(() => ({
    STORAGE_ACCOUNT_URL: 'https://teststorage.blob.core.windows.net',
    STORAGE_AUDIT_CONTAINER: 'audit-logs',
    STORAGE_RAW_CONTAINER: 'raw-observations',
  })),
}));

import { BlobStorageAdapter } from '../../adapters/blob-storage.adapter.js';

describe('BlobStorageAdapter', () => {
  let adapter: BlobStorageAdapter;

  beforeEach(() => {
    [mockUpload, mockCreateIfNotExists, mockGetBlockBlobClient, mockGetBlobClient]
      .forEach((fn) => fn.mockClear());
    adapter = new BlobStorageAdapter();
  });

  describe('writeAuditEntry', () => {
    it('uploads JSON audit entry with correct blob path', async () => {
      const entry = { action: 'observe', details: 'test' };

      await adapter.writeAuditEntry('tenant-1', entry);

      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        expect.stringMatching(/^tenant-1\/\d{4}\/\d{2}\/\d{2}\/.+\.json$/),
      );
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringContaining('"action"'),
        expect.any(Number),
        expect.objectContaining({
          blobHTTPHeaders: { blobContentType: 'application/json' },
        }),
      );
    });
  });

  describe('writeRawObservation', () => {
    it('uploads raw observation to session path', async () => {
      const data = { hookType: 'post_tool_use', toolName: 'file_read' };

      await adapter.writeRawObservation('tenant-1', 'session-1', 'obs-1', data);

      expect(mockGetBlockBlobClient).toHaveBeenCalledWith(
        'tenant-1/sessions/session-1/obs-1.json',
      );
      expect(mockUpload).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when blob listing succeeds', async () => {
      const result = await adapter.healthCheck();
      expect(result.status).toBe('healthy');
    });

    it('returns unhealthy when blob listing fails', async () => {
      mockListBlobsFlat.mockReturnValueOnce({
        byPage: vi.fn(() => ({
          next: vi.fn().mockRejectedValue(new Error('Connection refused')),
        })),
      });

      const freshAdapter = new BlobStorageAdapter();
      const result = await freshAdapter.healthCheck();

      expect(result.status).toBe('unhealthy');
    });
  });
});
