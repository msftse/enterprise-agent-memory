import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config/azure.config.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { tenantMiddleware } from './middleware/tenant.middleware.js';
import { registerRateLimit } from './middleware/rate-limit.middleware.js';
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

async function main(): Promise<void> {
  const config = loadConfig();

  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
  });

  // Plugins
  await app.register(cors, { origin: true });
  await registerRateLimit(app);

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

  // Auth middleware on all /api/v1 routes except health
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/api/v1/health') return;
    if (request.url === '/viewer' || request.url === '/') return;
    await authMiddleware(request, reply);
    if (reply.sent) return;
    await tenantMiddleware(request, reply);
  });

  // Viewer (no auth)
  registerViewerRoutes(app);

  // Register routes
  registerSessionRoutes(app, cosmos);
  registerObservationRoutes(app, cosmos, openai, search, blobStorage);
  registerMemoryRoutes(app, cosmos, openai, search, blobStorage);
  registerSearchRoutes(app, openai, search);
  registerGraphRoutes(app, cosmos, openai, blobStorage);
  registerAdminRoutes(app, cosmos, search, blobStorage);

  // Start
  const address = await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`🧠 Enterprise Agent Memory listening on ${address}`);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
