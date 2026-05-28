import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/azure.config.js';
import { apiKeyMiddleware } from './middleware/api-key.middleware.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { tenantMiddleware } from './middleware/tenant.middleware.js';
import { registerRateLimit } from './middleware/rate-limit.middleware.js';
import { runtimeStats } from './instrumentation/runtime-stats.js';
import { CosmosAdapter } from './adapters/cosmos.adapter.js';
import { AISearchAdapter } from './adapters/ai-search.adapter.js';
import { AzureOpenAIAdapter } from './adapters/azure-openai.adapter.js';
import { BlobStorageAdapter } from './adapters/blob-storage.adapter.js';
import { registerSessionRoutes } from './routes/sessions.routes.js';
import { registerObservationRoutes } from './routes/observations.routes.js';
import { registerMemoryRoutes } from './routes/memories.routes.js';
import { registerSearchRoutes } from './routes/search.routes.js';
import { registerGraphRoutes } from './routes/graph.routes.js';
import { registerAdminRoutes } from './routes/admin.routes.js';
import { registerViewerRoutes } from './routes/viewer.routes.js';
import { registerSavingsRoutes } from './routes/savings.routes.js';
import { registerScalabilityRoutes } from './routes/scalability.routes.js';
import { registerBenchmarksRoutes } from './routes/benchmarks.routes.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
  });

  // Plugins
  await app.register(cors, { origin: true });
  await registerRateLimit(app);

  // Phase 2: capture request latencies for /api/v1/scalability/metrics
  app.addHook('onResponse', async (_request, reply) => {
    runtimeStats.recordRequest(reply.elapsedTime);
  });

  // Initialize Azure adapters
  const cosmos = new CosmosAdapter();
  const search = new AISearchAdapter();
  const openai = new AzureOpenAIAdapter();
  const blobStorage = new BlobStorageAdapter();

  // Initialize services (graceful — log failures, don't crash)
  const initResults = await Promise.allSettled([
    cosmos.ensureInitialized(),
    search.ensureInitialized(),
    blobStorage.ensureInitialized(),
  ]);

  const serviceNames = ['Cosmos DB', 'AI Search', 'Blob Storage'];
  for (let i = 0; i < initResults.length; i++) {
    if (initResults[i].status === 'rejected') {
      app.log.warn(`⚠️  ${serviceNames[i]} init failed: ${(initResults[i] as PromiseRejectedResult).reason}`);
    } else {
      app.log.info(`✅ ${serviceNames[i]} initialized`);
    }
  }
  if (!openai.isAvailable) {
    app.log.warn('⚠️  Azure OpenAI not configured — LLM features disabled');
  }

  // Auth middleware on all /api/v1 routes except health.
  // Static viewer assets at /viewer/* are public (HTML/JS/CSS); their fetches
  // include the API key from localStorage.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/') return;
    if (request.url === '/api/v1/health') return;
    if (request.url === '/viewer' || request.url.startsWith('/viewer/')) return;
    await apiKeyMiddleware(request, reply);
    if (reply.sent) return;
    await authMiddleware(request, reply);
    if (reply.sent) return;
    await tenantMiddleware(request, reply);
  });

  // Viewer (no auth)
  await registerViewerRoutes(app);

  // Register routes
  registerSessionRoutes(app, cosmos);
  registerObservationRoutes(app, cosmos, openai, search, blobStorage);
  registerMemoryRoutes(app, cosmos, openai, search, blobStorage);
  registerSearchRoutes(app, openai, search, cosmos);
  registerGraphRoutes(app, cosmos, openai, blobStorage);
  registerAdminRoutes(app, cosmos, search, blobStorage);
  registerSavingsRoutes(app, cosmos);
  registerScalabilityRoutes(app, runtimeStats);
  registerBenchmarksRoutes(app, cosmos);

  // Start
  const address = await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`🧠 Enterprise Agent Memory listening on ${address}`);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
