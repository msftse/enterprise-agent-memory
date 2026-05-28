import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerBenchmarksRoutes } from '../../routes/benchmarks.routes.js';

const fakeCosmos = {
  createBenchmark: vi.fn(),
  latestBenchmark: vi.fn(),
  listBenchmarks: vi.fn(),
};

const SAMPLE = {
  id: '11111111-1111-1111-1111-111111111111',
  ranAt: '2026-05-27T00:00:00Z',
  actor: 'roey',
  modelDeployment: 'gpt-4o',
  results: [
    {
      taskName: 'auth-flow-recall',
      baseline:   { promptTokens: 47000, completionTokens: 1000, turns: 8 },
      withMemory: { promptTokens: 12000, completionTokens: 800,  turns: 3 },
      deltaTokens: -35200,
      deltaPct: -73.3,
    },
  ],
  summary: { totalBaselineTokens: 48000, totalWithMemoryTokens: 12800, avgDeltaPct: -73.3 },
};

describe('benchmarks routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    Object.values(fakeCosmos).forEach((m) => (m as any).mockReset());
    app = Fastify();
    registerBenchmarksRoutes(app, fakeCosmos as any);
  });

  afterEach(async () => app.close());

  it('POST rejects malformed payload with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/benchmarks',
      payload: { bogus: true },
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST persists a valid payload', async () => {
    fakeCosmos.createBenchmark.mockResolvedValue(undefined);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/benchmarks',
      payload: SAMPLE,
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(201);
    expect(fakeCosmos.createBenchmark).toHaveBeenCalledWith('pilot', SAMPLE);
    expect(res.json().data.id).toBe(SAMPLE.id);
  });

  it('GET /latest returns the most recent run', async () => {
    fakeCosmos.latestBenchmark.mockResolvedValue(SAMPLE);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/benchmarks/latest',
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(SAMPLE.id);
  });

  it('GET /latest returns empty body when no runs yet', async () => {
    fakeCosmos.latestBenchmark.mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/benchmarks/latest',
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.results).toEqual([]);
  });

  it('GET / returns paginated history', async () => {
    fakeCosmos.listBenchmarks.mockResolvedValue([SAMPLE]);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/benchmarks?limit=5',
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(200);
    expect(fakeCosmos.listBenchmarks).toHaveBeenCalledWith('pilot', 5);
    expect(res.json().data.items).toHaveLength(1);
  });
});
