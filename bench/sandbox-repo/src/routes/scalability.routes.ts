import type { FastifyInstance } from 'fastify';
import type { RuntimeStats } from '../instrumentation/runtime-stats.js';

function tenantOf(headers: Record<string, unknown>): string {
  const raw = headers['x-tenant-id'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v ? v : 'pilot';
}

export function registerScalabilityRoutes(app: FastifyInstance, stats: RuntimeStats): void {
  app.get('/api/v1/scalability/metrics', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    const s = stats.snapshot();
    return {
      data: {
        replicas: {
          configured: {
            min: Number(process.env.CONTAINER_MIN_REPLICAS ?? '1'),
            max: Number(process.env.CONTAINER_MAX_REPLICAS ?? '10'),
          },
        },
        latency: s.latency,
        throughput: s.throughput,
        uptime: s.uptime,
      },
      meta: { requestId: '-', timestamp: new Date().toISOString(), tenantId: tenant },
    };
  });
}
