import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerScalabilityRoutes } from '../../routes/scalability.routes.js';

const fakeStats = {
  snapshot: vi.fn(() => ({
    latency: { p50Ms: 47, p95Ms: 312, p99Ms: 890, sampleSize: 250 },
    throughput: { rpmLast1m: 3, rpmLast5m: 7, rpmLast15m: 5 },
    uptime: { startedAt: '2026-05-27T17:00:00Z', restartCount: 1 },
  })),
};

describe('scalability route', () => {
  let app: FastifyInstance;
  let origMin: string | undefined;
  let origMax: string | undefined;

  beforeEach(() => {
    origMin = process.env.CONTAINER_MIN_REPLICAS;
    origMax = process.env.CONTAINER_MAX_REPLICAS;
    process.env.CONTAINER_MIN_REPLICAS = '1';
    process.env.CONTAINER_MAX_REPLICAS = '10';
    app = Fastify();
    registerScalabilityRoutes(app, fakeStats as any);
  });

  afterEach(async () => {
    process.env.CONTAINER_MIN_REPLICAS = origMin;
    process.env.CONTAINER_MAX_REPLICAS = origMax;
    await app.close();
  });

  it('merges configured replicas + runtime stats snapshot', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/scalability/metrics',
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.replicas.configured).toEqual({ min: 1, max: 10 });
    expect(d.latency.p95Ms).toBe(312);
    expect(d.throughput.rpmLast1m).toBe(3);
    expect(d.uptime.startedAt).toBe('2026-05-27T17:00:00Z');
    expect(d.uptime.restartCount).toBe(1);
  });

  it('defaults to min=1 max=10 when env vars are missing', async () => {
    delete process.env.CONTAINER_MIN_REPLICAS;
    delete process.env.CONTAINER_MAX_REPLICAS;
    // Rebuild app so the env-read happens after we deleted them
    await app.close();
    app = Fastify();
    registerScalabilityRoutes(app, fakeStats as any);
    const res = await app.inject({ method: 'GET', url: '/api/v1/scalability/metrics', headers: { 'x-tenant-id': 'pilot' } });
    expect(res.json().data.replicas.configured).toEqual({ min: 1, max: 10 });
  });
});
