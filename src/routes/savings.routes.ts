import type { FastifyInstance } from 'fastify';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';

// gpt-4o input price (override via env). Keep conservative; users can tune.
const USD_PER_INPUT_TOKEN = Number(process.env.EAM_GPT4O_INPUT_USD_PER_TOKEN ?? '0.0000025');

const COMPRESSION_BUCKET_EDGES = [1, 2, 5, 10, 20, 50, 100];

interface MemoryRow {
  id: string;
  title: string;
  createdAt: string;
  sourceTokens?: number;
  compressedTokens?: number;
  recallCount?: number;
  actor?: string;
}

function envelope<T>(data: T, tenantId: string) {
  return { data, meta: { requestId: '-', timestamp: new Date().toISOString(), tenantId } };
}

function savedTokens(m: MemoryRow): number {
  if (!m.sourceTokens || !m.compressedTokens || !m.recallCount) return 0;
  return Math.max(0, (m.sourceTokens - m.compressedTokens) * m.recallCount);
}

function compressionBucketLabel(ratio: number): string {
  for (let i = 0; i < COMPRESSION_BUCKET_EDGES.length - 1; i++) {
    const lo = COMPRESSION_BUCKET_EDGES[i];
    const hi = COMPRESSION_BUCKET_EDGES[i + 1];
    if (ratio >= lo && ratio < hi) return `${lo}:1-${hi}:1`;
  }
  return `${COMPRESSION_BUCKET_EDGES[COMPRESSION_BUCKET_EDGES.length - 1]}:1+`;
}

function tenantOf(headers: Record<string, unknown>): string {
  const raw = headers['x-tenant-id'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v ? v : 'pilot';
}

export function registerSavingsRoutes(app: FastifyInstance, cosmos: CosmosAdapter): void {
  // ---- Summary --------------------------------------------------------------
  app.get('/api/v1/savings/summary', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    let rows: MemoryRow[] = [];
    try {
      rows = await cosmos.listMemoriesForSavings(tenant);
    } catch (e) {
      req.log.warn({ err: e }, 'savings/summary degraded — returning zeroes');
    }

    const totalSavedTokens = rows.reduce((s, m) => s + savedTokens(m), 0);
    const totalSourceTokens = rows.reduce((s, m) => s + (m.sourceTokens ?? 0), 0);
    const totalCompressedTokens = rows.reduce((s, m) => s + (m.compressedTokens ?? 0), 0);
    const totalRecalls = rows.reduce((s, m) => s + (m.recallCount ?? 0), 0);
    const compressionRatio = totalCompressedTokens > 0 ? totalSourceTokens / totalCompressedTokens : 0;
    const windowStart = rows.length > 0
      ? rows.map((r) => r.createdAt).filter(Boolean).sort()[0] ?? ''
      : '';

    return envelope({
      totalSavedTokens,
      totalSavedUsd: totalSavedTokens * USD_PER_INPUT_TOKEN,
      memoryCount: rows.length,
      totalRecalls,
      totalSourceTokens,
      totalCompressedTokens,
      compressionRatio,
      windowStart,
    }, tenant);
  });

  // ---- Time series ----------------------------------------------------------
  app.get<{ Querystring: { days?: string } }>('/api/v1/savings/timeseries', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    const days = Math.max(1, Math.min(365, Number(req.query.days ?? '30')));
    let rows: MemoryRow[] = [];
    try {
      rows = await cosmos.listMemoriesForSavings(tenant);
    } catch (e) {
      req.log.warn({ err: e }, 'savings/timeseries degraded');
      return envelope({ buckets: [] }, tenant);
    }

    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    type Bucket = { date: string; savedTokens: number; recalls: number; newMemories: number };
    const byDate = new Map<string, Bucket>();
    for (const m of rows) {
      if (!m.createdAt || m.createdAt < cutoff) continue;
      const date = m.createdAt.slice(0, 10);
      const b = byDate.get(date) ?? { date, savedTokens: 0, recalls: 0, newMemories: 0 };
      b.savedTokens += savedTokens(m);
      b.recalls += m.recallCount ?? 0;
      b.newMemories += 1;
      byDate.set(date, b);
    }
    const buckets = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return envelope({ buckets }, tenant);
  });

  // ---- By actor -------------------------------------------------------------
  app.get('/api/v1/savings/by-actor', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    let rows: MemoryRow[] = [];
    try {
      rows = await cosmos.listMemoriesForSavings(tenant);
    } catch (e) {
      req.log.warn({ err: e }, 'savings/by-actor degraded');
      return envelope({ actors: [] }, tenant);
    }
    type Acc = { actor: string; savedTokens: number; memoryCount: number; recallCount: number };
    const byActor = new Map<string, Acc>();
    for (const m of rows) {
      const actor = m.actor || 'unknown';
      const a = byActor.get(actor) ?? { actor, savedTokens: 0, memoryCount: 0, recallCount: 0 };
      a.savedTokens += savedTokens(m);
      a.memoryCount += 1;
      a.recallCount += m.recallCount ?? 0;
      byActor.set(actor, a);
    }
    const actors = [...byActor.values()].sort((a, b) => b.savedTokens - a.savedTokens);
    return envelope({ actors }, tenant);
  });

  // ---- Top recalled memories ------------------------------------------------
  app.get<{ Querystring: { limit?: string } }>('/api/v1/savings/top-memories', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? '10')));
    let rows: MemoryRow[] = [];
    try {
      rows = await cosmos.listMemoriesForSavings(tenant);
    } catch (e) {
      req.log.warn({ err: e }, 'savings/top-memories degraded');
      return envelope({ items: [] }, tenant);
    }
    const items = rows
      .filter((m) => (m.recallCount ?? 0) > 0)
      .sort((a, b) => (b.recallCount ?? 0) - (a.recallCount ?? 0))
      .slice(0, limit)
      .map((m) => ({
        id: m.id,
        title: m.title,
        recallCount: m.recallCount ?? 0,
        sourceTokens: m.sourceTokens ?? 0,
        compressedTokens: m.compressedTokens ?? 0,
        savedTokens: savedTokens(m),
        createdAt: m.createdAt,
      }));
    return envelope({ items }, tenant);
  });

  // ---- Compression distribution --------------------------------------------
  app.get('/api/v1/savings/compression-distribution', async (req) => {
    const tenant = tenantOf(req.headers as Record<string, unknown>);
    let rows: MemoryRow[] = [];
    try {
      rows = await cosmos.listMemoriesForSavings(tenant);
    } catch (e) {
      req.log.warn({ err: e }, 'savings/compression-distribution degraded');
      return envelope({ buckets: [] }, tenant);
    }
    const counts = new Map<string, number>();
    for (const m of rows) {
      if (!m.sourceTokens || !m.compressedTokens || m.compressedTokens === 0) continue;
      const r = m.sourceTokens / m.compressedTokens;
      const label = compressionBucketLabel(r);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    // Emit buckets in canonical low→high ratio order so the histogram reads left-to-right.
    const buckets: Array<{ bucket: string; count: number }> = [];
    for (let i = 0; i < COMPRESSION_BUCKET_EDGES.length - 1; i++) {
      const label = `${COMPRESSION_BUCKET_EDGES[i]}:1-${COMPRESSION_BUCKET_EDGES[i + 1]}:1`;
      const count = counts.get(label) ?? 0;
      if (count > 0) buckets.push({ bucket: label, count });
    }
    const tailLabel = `${COMPRESSION_BUCKET_EDGES[COMPRESSION_BUCKET_EDGES.length - 1]}:1+`;
    const tailCount = counts.get(tailLabel) ?? 0;
    if (tailCount > 0) buckets.push({ bucket: tailLabel, count: tailCount });
    return envelope({ buckets }, tenant);
  });
}
