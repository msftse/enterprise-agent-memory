import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { getConfig } from '../config/azure.config.js';

const AUDIT_CONTAINER = 'audit-trail';
const RAW_CONTAINER = 'raw-observations';

export class BlobStorageAdapter {
  private blobService: BlobServiceClient | null = null;
  private auditContainer: ContainerClient | null = null;
  private rawContainer: ContainerClient | null = null;
  private initialized = false;

  private getBlobService(): BlobServiceClient {
    if (!this.blobService) {
      const config = getConfig();
      const storageKey = process.env.STORAGE_ACCOUNT_KEY;
      if (storageKey) {
        const accountName = new URL(config.STORAGE_ACCOUNT_URL).hostname.split('.')[0];
        const sharedKeyCred = new StorageSharedKeyCredential(accountName, storageKey);
        this.blobService = new BlobServiceClient(config.STORAGE_ACCOUNT_URL, sharedKeyCred);
      } else {
        const credential = new DefaultAzureCredential();
        this.blobService = new BlobServiceClient(config.STORAGE_ACCOUNT_URL, credential);
      }
    }
    return this.blobService;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const service = this.getBlobService();

    this.auditContainer = service.getContainerClient(AUDIT_CONTAINER);
    await this.auditContainer.createIfNotExists();

    this.rawContainer = service.getContainerClient(RAW_CONTAINER);
    await this.rawContainer.createIfNotExists();

    this.initialized = true;
  }

  private getAuditContainer(): ContainerClient {
    if (!this.auditContainer)
      throw new Error('BlobStorageAdapter not initialized');
    return this.auditContainer;
  }

  private getRawContainer(): ContainerClient {
    if (!this.rawContainer)
      throw new Error('BlobStorageAdapter not initialized');
    return this.rawContainer;
  }

  async writeAuditEntry(tenantId: string, entry: object): Promise<void> {
    await this.ensureInitialized();
    const container = this.getAuditContainer();

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const blobPath = `${tenantId}/${year}/${month}/${day}/${id}.json`;

    const data = JSON.stringify(entry, null, 2);
    const blockBlob = container.getBlockBlobClient(blobPath);
    await blockBlob.upload(data, Buffer.byteLength(data), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
  }

  async writeRawObservation(
    tenantId: string,
    sessionId: string,
    observationId: string,
    data: object,
  ): Promise<void> {
    await this.ensureInitialized();
    const container = this.getRawContainer();

    const blobPath = `${tenantId}/sessions/${sessionId}/${observationId}.json`;
    const content = JSON.stringify(data, null, 2);
    const blockBlob = container.getBlockBlobClient(blobPath);
    await blockBlob.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
  }

  async listAuditEntries(
    tenantId: string,
    options?: { dateFrom?: string; dateTo?: string; limit?: number },
  ): Promise<object[]> {
    await this.ensureInitialized();
    const container = this.getAuditContainer();
    const limit = options?.limit ?? 100;

    const prefix = `${tenantId}/`;
    const entries: object[] = [];

    const dateFrom = options?.dateFrom ? new Date(options.dateFrom) : null;
    const dateTo = options?.dateTo ? new Date(options.dateTo) : null;

    for await (const blob of container.listBlobsFlat({ prefix })) {
      if (entries.length >= limit) break;

      // Filter by date if provided — path format: {tenantId}/{year}/{month}/{day}/{id}.json
      if (dateFrom || dateTo) {
        const parts = blob.name.split('/');
        if (parts.length >= 4) {
          const blobDate = new Date(`${parts[1]}-${parts[2]}-${parts[3]}`);
          if (dateFrom && blobDate < dateFrom) continue;
          if (dateTo && blobDate > dateTo) continue;
        }
      }

      const blobClient = container.getBlobClient(blob.name);
      const downloaded = await blobClient.downloadToBuffer();
      try {
        entries.push(JSON.parse(downloaded.toString()));
      } catch {
        // Skip malformed entries
      }
    }

    return entries;
  }

  async purgeTenant(
    tenantId: string,
  ): Promise<{ auditDeleted: number; rawDeleted: number }> {
    await this.ensureInitialized();

    const auditDeleted = await this.purgeContainerByPrefix(
      this.getAuditContainer(),
      `${tenantId}/`,
    );
    const rawDeleted = await this.purgeContainerByPrefix(
      this.getRawContainer(),
      `${tenantId}/`,
    );

    return { auditDeleted, rawDeleted };
  }

  private async purgeContainerByPrefix(
    container: ContainerClient,
    prefix: string,
  ): Promise<number> {
    let count = 0;
    for await (const blob of container.listBlobsFlat({ prefix })) {
      await container.getBlockBlobClient(blob.name).delete();
      count++;
    }
    return count;
  }

  async healthCheck(): Promise<{ status: string }> {
    try {
      // Use data-plane blob operation within known container
      const service = this.getBlobService();
      const container = service.getContainerClient(AUDIT_CONTAINER);
      const iter = container.listBlobsFlat().byPage({ maxPageSize: 1 });
      await iter.next();
      return { status: 'healthy' };
    } catch {
      return { status: 'unhealthy' };
    }
  }
}
