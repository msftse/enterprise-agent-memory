import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';

const TaskResult = z.object({
  taskName: z.string(),
  baseline:   z.object({ promptTokens: z.number(), completionTokens: z.number(), turns: z.number() }),
  withMemory: z.object({ promptTokens: z.number(), completionTokens: z.number(), turns: z.number() }),
  deltaTokens: z.number(),
  deltaPct: z.number(),
});

const BenchmarkRun = z.object({
  id: z.string().uuid(),
  ranAt: z.string(),
  actor: z.string(),
  modelDeployment: z.string(),
  results: z.array(TaskResult).min(1),
  summary: z.object({
    totalBaselineTokens: z.number(),
    totalWithMemoryTokens: z.number(),
    avgDeltaPct: z.number(),
  }),
});

export type BenchmarkRunPayload = z.infer<typeof BenchmarkRun>;

function envelope<T>(data: T, tenantId: string) {
  return { data, meta: { requestId: '-', timestamp: new Date().toISOString(), tenantId } };
}

function tenantOf(headers: Record<string, unknown>): string {
  const raw = headers['x-tenant-id'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v ? v : 'pilot';
}

export function registerBenchmarksRoutes(app: FastifyInstance, cosmos: CosmosAdapter): void {
  app.post('/api/v1/benchmarks', async (req, reply) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    const parsed = BenchmarkRun.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({
        error: { code: 'INVALID_BODY', message: parsed.error.message, status: 400 },
      });
      return;
    }
    await cosmos.createBenchmark(tenant, parsed.data);
    reply.code(201).send(envelope({ id: parsed.data.id }, tenant));
  });

  app.get('/api/v1/benchmarks/latest', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    const run = await cosmos.latestBenchmark(tenant);
    return envelope(run ?? { results: [], summary: null }, tenant);
  });

  app.get<{ Querystring: { limit?: string } }>('/api/v1/benchmarks', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? '20')));
    const items = await cosmos.listBenchmarks(tenant, limit);
    return envelope({ items }, tenant);
  });
}
