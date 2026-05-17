import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

// ---- Mock config (AUTH_DISABLED=true) ----
const mockConfig = {
  COSMOS_ENDPOINT: 'https://test.documents.azure.com:443/',
  COSMOS_DATABASE: 'testdb',
  AI_SEARCH_ENDPOINT: 'https://test.search.windows.net',
  AI_SEARCH_INDEX: 'agent-memory',
  STORAGE_ACCOUNT_URL: 'https://teststorage.blob.core.windows.net',
  STORAGE_AUDIT_CONTAINER: 'audit-logs',
  STORAGE_RAW_CONTAINER: 'raw-observations',
  PORT: 8080,
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'error' as const,
  RATE_LIMIT_PER_MINUTE: 10_000,
  AUTH_DISABLED: true,
  AUTH_AUDIENCE: undefined,
  AUTH_ISSUER: undefined,
  AZURE_TENANT_ID: undefined,
  AZURE_CLIENT_ID: undefined,
  AZURE_CLIENT_SECRET: undefined,
  AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/',
  AZURE_OPENAI_API_KEY: 'test-key',
  AZURE_OPENAI_DEPLOYMENT_CHAT: 'gpt-4o',
  AZURE_OPENAI_DEPLOYMENT_EMBEDDING: 'text-embedding-3-large',
  AZURE_OPENAI_API_VERSION: '2024-12-01-preview',
  AI_SEARCH_ADMIN_KEY: undefined,
};

vi.mock('../../config/azure.config.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
  getConfig: vi.fn(() => mockConfig),
}));

import { authMiddleware } from '../../middleware/auth.middleware.js';
import { tenantMiddleware } from '../../middleware/tenant.middleware.js';
import { registerRateLimit } from '../../middleware/rate-limit.middleware.js';
import { registerSessionRoutes } from '../../routes/sessions.routes.js';
import { registerObservationRoutes } from '../../routes/observations.routes.js';
import { registerMemoryRoutes } from '../../routes/memories.routes.js';
import { registerSearchRoutes } from '../../routes/search.routes.js';
import { registerAdminRoutes } from '../../routes/admin.routes.js';

// ---- Mock adapter factories ----
function createMockCosmos() {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    purgeContainer: vi.fn().mockResolvedValue(0),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', latencyMs: 5 }),
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOpenAI() {
  return {
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    compress: vi.fn().mockResolvedValue(JSON.stringify({
      title: 'Compressed observation',
      subtitle: 'Test',
      facts: ['test fact'],
      narrative: 'Test narrative for observation.',
      concepts: ['testing'],
      files: [],
      importance: 5,
      type: 'other',
    })),
    summarize: vi.fn().mockResolvedValue('summary'),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    extractGraphEntities: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    isAvailable: true,
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', model: 'gpt-4o' }),
  };
}

function createMockSearch() {
  return {
    indexDocument: vi.fn().mockResolvedValue(undefined),
    indexDocumentBatch: vi.fn().mockResolvedValue(undefined),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    hybridSearch: vi.fn().mockResolvedValue([]),
    purgeTenant: vi.fn().mockResolvedValue(0),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', documentCount: 0 }),
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockBlob() {
  return {
    writeAuditEntry: vi.fn().mockResolvedValue(undefined),
    writeRawObservation: vi.fn().mockResolvedValue(undefined),
    listAuditEntries: vi.fn().mockResolvedValue([]),
    purgeTenant: vi.fn().mockResolvedValue({ auditDeleted: 0, rawDeleted: 0 }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
  };
}

// ---- Helpers ----
type MockAdapters = ReturnType<typeof buildMockAdapters>;

function buildMockAdapters() {
  return {
    cosmos: createMockCosmos(),
    openai: createMockOpenAI(),
    search: createMockSearch(),
    blob: createMockBlob(),
  };
}

async function buildTestApp(adapters: MockAdapters) {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await registerRateLimit(app);

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/v1/health') return;
    await authMiddleware(request, reply);
    if (reply.sent) return;
    await tenantMiddleware(request, reply);
  });

  registerSessionRoutes(app, adapters.cosmos as any);
  registerObservationRoutes(
    app,
    adapters.cosmos as any,
    adapters.openai as any,
    adapters.search as any,
    adapters.blob as any,
  );
  registerMemoryRoutes(
    app,
    adapters.cosmos as any,
    adapters.openai as any,
    adapters.search as any,
    adapters.blob as any,
  );
  registerSearchRoutes(app, adapters.openai as any, adapters.search as any);
  registerAdminRoutes(app, adapters.cosmos as any, adapters.search as any, adapters.blob as any);

  await app.ready();
  return app;
}

// ====================================================================
// Tests
// ====================================================================

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let adapters: MockAdapters;

  beforeAll(async () => {
    adapters = buildMockAdapters();
    app = await buildTestApp(adapters);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- Health ----
  describe('GET /api/v1/health', () => {
    it('returns 200 when all services are healthy', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('healthy');
      expect(body.data.services.cosmos).toBe('healthy');
      expect(body.data.services.search).toBe('healthy');
      expect(body.data.services.blob).toBe('healthy');
    });

    it('returns 503 when Cosmos is unhealthy', async () => {
      adapters.cosmos.healthCheck.mockResolvedValueOnce({ status: 'unhealthy', latencyMs: 100 });

      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('degraded');
      expect(body.data.services.cosmos).toBe('unhealthy');
    });

    it('returns 503 when Search is unhealthy', async () => {
      adapters.search.healthCheck.mockResolvedValueOnce({ status: 'unhealthy', documentCount: 0 });

      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.data.services.search).toBe('unhealthy');
    });

    it('does not require authentication', async () => {
      // No auth header needed for health endpoint
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(res.statusCode).toBeLessThan(400);
    });
  });

  // ---- Sessions ----
  describe('POST /api/v1/sessions', () => {
    it('creates a session and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: {
          project: 'my-project',
          cwd: '/workspace',
          model: 'gpt-4o',
          tags: ['test'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.project).toBe('my-project');
      expect(body.data.cwd).toBe('/workspace');
      expect(body.data.status).toBe('active');
      expect(body.data.observationCount).toBe(0);
      expect(body.data.id).toBeDefined();
      expect(body.meta.tenantId).toBe('dev-tenant');
    });

    it('stores session in Cosmos DB', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { project: 'p', cwd: '/cwd' },
      });

      expect(adapters.cosmos.create).toHaveBeenCalledWith(
        'sessions',
        expect.objectContaining({
          project: 'p',
          tenantId: 'dev-tenant',
          status: 'active',
        }),
      );
    });
  });

  describe('GET /api/v1/sessions/:id', () => {
    it('returns 404 when session not found', async () => {
      adapters.cosmos.read.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns session when found', async () => {
      adapters.cosmos.read.mockResolvedValueOnce({
        id: 'sess-1',
        tenantId: 'dev-tenant',
        project: 'test',
        status: 'active',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/sess-1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe('sess-1');
    });
  });

  // ---- Observations ----
  describe('POST /api/v1/observations', () => {
    it('captures observation and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/observations',
        payload: {
          sessionId: 'session-1',
          hookType: 'post_tool_use',
          toolName: 'file_read',
          toolInput: { path: '/src/main.ts' },
          toolOutput: 'content',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.title).toBeDefined();
      expect(body.data.type).toBeDefined();
      expect(body.meta.tenantId).toBe('dev-tenant');
    });

    it('archives raw observation to blob storage', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/observations',
        payload: {
          sessionId: 'session-1',
          hookType: 'post_tool_use',
        },
      });

      expect(adapters.blob.writeRawObservation).toHaveBeenCalledWith(
        'dev-tenant',
        'session-1',
        expect.any(String),
        expect.any(Object),
      );
    });

    it('generates embedding for the compressed observation', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/observations',
        payload: {
          sessionId: 'session-1',
          hookType: 'post_tool_use',
        },
      });

      expect(adapters.openai.embed).toHaveBeenCalled();
    });

    it('indexes observation in AI Search', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/observations',
        payload: {
          sessionId: 'session-1',
          hookType: 'post_tool_use',
        },
      });

      expect(adapters.search.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'dev-tenant',
          docType: 'observation',
        }),
      );
    });
  });

  // ---- Memories ----
  describe('POST /api/v1/memories', () => {
    it('creates a memory and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/memories',
        payload: {
          type: 'pattern',
          title: 'Test Pattern',
          content: 'Test pattern content',
          concepts: ['testing'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.title).toBe('Test Pattern');
      expect(body.data.type).toBe('pattern');
      expect(body.data.version).toBe(1);
      expect(body.data.isLatest).toBe(true);
      expect(body.data.embedding).toBeDefined();
    });

    it('calls openai.embed and stores in Cosmos + Search', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/memories',
        payload: {
          type: 'fact',
          title: 'T',
          content: 'C',
        },
      });

      expect(adapters.openai.embed).toHaveBeenCalled();
      expect(adapters.cosmos.create).toHaveBeenCalledWith(
        'memories',
        expect.objectContaining({ type: 'fact' }),
      );
      expect(adapters.search.indexDocument).toHaveBeenCalledWith(
        expect.objectContaining({ docType: 'memory' }),
      );
    });
  });

  describe('GET /api/v1/memories/:id', () => {
    it('returns 404 when memory not found', async () => {
      adapters.cosmos.read.mockResolvedValueOnce(null);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/memories/nonexistent',
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns memory when found', async () => {
      adapters.cosmos.read.mockResolvedValueOnce({
        id: 'mem-1',
        tenantId: 'dev-tenant',
        type: 'pattern',
        title: 'Test',
        content: 'Content',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/memories/mem-1',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe('mem-1');
    });
  });

  // ---- Search ----
  describe('POST /api/v1/search', () => {
    it('returns search results', async () => {
      adapters.search.hybridSearch.mockResolvedValueOnce([
        {
          id: 'doc-1',
          tenantId: 'dev-tenant',
          docType: 'memory',
          title: 'Found Memory',
          content: 'Relevant content',
          score: 0.95,
          bm25Score: 0.8,
          vectorScore: 0.9,
        },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: { query: 'test search' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.results).toHaveLength(1);
      expect(body.data.results[0].title).toBe('Found Memory');
      expect(body.data.totalCount).toBe(1);
      expect(body.data.searchDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('embeds query before searching', async () => {
      adapters.search.hybridSearch.mockResolvedValueOnce([]);

      await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: { query: 'find patterns' },
      });

      expect(adapters.openai.embed).toHaveBeenCalledWith('find patterns');
    });

    it('returns empty results when no matches', async () => {
      adapters.search.hybridSearch.mockResolvedValueOnce([]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search',
        payload: { query: 'nonexistent' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.results).toEqual([]);
      expect(body.data.totalCount).toBe(0);
    });
  });
});
