import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockKeys = vi.fn<() => string[]>(() => []);

vi.mock('../../config/azure.config.js', () => ({
  getConfig: vi.fn(() => ({
    EAM_API_KEYS: mockKeys(),
  })),
}));

import { apiKeyMiddleware } from '../../middleware/api-key.middleware.js';

function makeApp(): FastifyInstance {
  const app = Fastify();
  app.addHook('onRequest', apiKeyMiddleware);
  app.get('/anything', async () => ({ ok: true }));
  return app;
}

describe('apiKeyMiddleware', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    mockKeys.mockReset();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('passes through when EAM_API_KEYS is empty (gate disabled)', async () => {
    mockKeys.mockReturnValue([]);
    app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/anything' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects when x-api-key header is missing', async () => {
    mockKeys.mockReturnValue(['valid-key']);
    app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/anything' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_API_KEY');
  });

  it('rejects when x-api-key does not match any configured key', async () => {
    mockKeys.mockReturnValue(['valid-key']);
    app = makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/anything',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('passes through when x-api-key matches a configured key', async () => {
    mockKeys.mockReturnValue(['valid-key', 'another-key']);
    app = makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/anything',
      headers: { 'x-api-key': 'another-key' },
    });
    expect(res.statusCode).toBe(200);
  });
});
