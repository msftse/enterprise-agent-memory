import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerSavingsRoutes } from '../../routes/savings.routes.js';

interface MemoryRow {
  id: string;
  title: string;
  createdAt: string;
  sourceTokens?: number;
  compressedTokens?: number;
  recallCount?: number;
  actor?: string;
}

const fakeCosmos = {
  listMemoriesForSavings: vi.fn<(tenantId: string) => Promise<MemoryRow[]>>(),
};

const SAMPLE: MemoryRow[] = [
  { id: 'm1', title: 'Auth', createdAt: '2026-05-01T10:00:00Z', sourceTokens: 200, compressedTokens: 50, recallCount: 5, actor: 'roey' },
  { id: 'm2', title: 'Cosmos', createdAt: '2026-05-02T10:00:00Z', sourceTokens: 300, compressedTokens: 80, recallCount: 3, actor: 'roey' },
  { id: 'm3', title: 'Search', createdAt: '2026-05-02T10:00:00Z', sourceTokens: 100, compressedTokens: 40, recallCount: 7, actor: 'shiron' },
  { id: 'm4', title: 'NoTokens', createdAt: '2026-04-15T10:00:00Z' }, // legacy
];

describe('savings routes', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    fakeCosmos.listMemoriesForSavings.mockReset();
    fakeCosmos.listMemoriesForSavings.mockResolvedValue(SAMPLE);
    app = Fastify();
    registerSavingsRoutes(app, fakeCosmos as any);
  });

  afterEach(async () => app.close());

  it('GET /api/v1/savings/summary aggregates the headline metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/savings/summary',
      headers: { 'x-tenant-id': 'pilot' },
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    // savings = (200-50)*5 + (300-80)*3 + (100-40)*7 = 750 + 660 + 420 = 1830
    expect(d.totalSavedTokens).toBe(1830);
    expect(d.memoryCount).toBe(4);
    expect(d.totalRecalls).toBe(15);
    expect(d.totalSourceTokens).toBe(600);
    expect(d.totalCompressedTokens).toBe(170);
    expect(d.compressionRatio).toBeCloseTo(600 / 170, 2);
    expect(d.totalSavedUsd).toBeGreaterThan(0);
    expect(d.windowStart).toBe('2026-04-15T10:00:00Z');
  });

  it('returns zeroes when no memories exist', async () => {
    fakeCosmos.listMemoriesForSavings.mockResolvedValueOnce([]);
    const res = await app.inject({ method: 'GET', url: '/api/v1/savings/summary', headers: { 'x-tenant-id': 'pilot' } });
    const d = res.json().data;
    expect(d.totalSavedTokens).toBe(0);
    expect(d.memoryCount).toBe(0);
    expect(d.compressionRatio).toBe(0);
  });

  it('degrades to zero summary on Cosmos error (no 500)', async () => {
    fakeCosmos.listMemoriesForSavings.mockRejectedValueOnce(new Error('Cosmos timeout'));
    const res = await app.inject({ method: 'GET', url: '/api/v1/savings/summary', headers: { 'x-tenant-id': 'pilot' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.totalSavedTokens).toBe(0);
  });

  it('GET /api/v1/savings/timeseries buckets by day over the requested window', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/savings/timeseries?days=60',
      headers: { 'x-tenant-id': 'pilot' },
    });
    const d = res.json().data;
    // Buckets sorted by date asc, only days within the window
    expect(d.buckets.length).toBeGreaterThanOrEqual(2);
    const may1 = d.buckets.find((b: any) => b.date === '2026-05-01');
    expect(may1.savedTokens).toBe((200 - 50) * 5);
    const may2 = d.buckets.find((b: any) => b.date === '2026-05-02');
    expect(may2.newMemories).toBe(2);
    expect(may2.savedTokens).toBe((300 - 80) * 3 + (100 - 40) * 7);
  });

  it('GET /api/v1/savings/by-actor groups by actor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/savings/by-actor',
      headers: { 'x-tenant-id': 'pilot' },
    });
    const d = res.json().data;
    const roey = d.actors.find((a: any) => a.actor === 'roey');
    const shiron = d.actors.find((a: any) => a.actor === 'shiron');
    expect(roey.memoryCount).toBe(2);
    expect(roey.savedTokens).toBe(750 + 660);
    expect(shiron.memoryCount).toBe(1);
    expect(shiron.savedTokens).toBe(420);
    // The legacy (no actor) row is bucketed under 'unknown'
    const unknown = d.actors.find((a: any) => a.actor === 'unknown');
    expect(unknown.memoryCount).toBe(1);
  });

  it('GET /api/v1/savings/top-memories returns DESC by recallCount with savedTokens computed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/savings/top-memories?limit=3',
      headers: { 'x-tenant-id': 'pilot' },
    });
    const items = res.json().data.items;
    expect(items).toHaveLength(3);
    expect(items[0].recallCount).toBe(7); // m3
    expect(items[0].savedTokens).toBe((100 - 40) * 7);
    expect(items[1].recallCount).toBe(5);
    expect(items[2].recallCount).toBe(3);
  });

  it('GET /api/v1/savings/compression-distribution buckets ratios', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/savings/compression-distribution',
      headers: { 'x-tenant-id': 'pilot' },
    });
    const d = res.json().data;
    // m1: 200/50 = 4 → '2:1-5:1'
    // m2: 300/80 = 3.75 → '2:1-5:1'
    // m3: 100/40 = 2.5 → '2:1-5:1'
    // m4: skipped (no tokens)
    const target = d.buckets.find((b: any) => b.bucket === '2:1-5:1');
    expect(target?.count).toBe(3);
  });
});
