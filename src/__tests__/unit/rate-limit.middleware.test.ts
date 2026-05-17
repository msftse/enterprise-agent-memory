import { describe, it, expect, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

vi.mock('../../config/azure.config.js', () => ({
  getConfig: vi.fn(() => ({
    RATE_LIMIT_PER_MINUTE: 2,
  })),
}));

import { registerRateLimit } from '../../middleware/rate-limit.middleware.js';

describe('registerRateLimit', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('allows requests under the limit', async () => {
    app = Fastify();
    await registerRateLimit(app);
    app.get('/test', async () => ({ ok: true }));

    const res1 = await app.inject({ method: 'GET', url: '/test' });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({ method: 'GET', url: '/test' });
    expect(res2.statusCode).toBe(200);
  });

  it('returns 429 when rate limit exceeded', async () => {
    app = Fastify();
    await registerRateLimit(app);
    app.get('/test', async () => ({ ok: true }));

    // Exhaust the limit (2 per minute)
    await app.inject({ method: 'GET', url: '/test' });
    await app.inject({ method: 'GET', url: '/test' });

    // Third request should be rate limited
    const res3 = await app.inject({ method: 'GET', url: '/test' });
    expect(res3.statusCode).toBe(429);
  });

  it('includes rate limit headers in response', async () => {
    app = Fastify();
    await registerRateLimit(app);
    app.get('/test', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/test' });

    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});
