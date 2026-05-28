import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const mockConfig = vi.fn();
vi.mock('../../config/azure.config.js', () => ({
  getConfig: () => mockConfig(),
}));

import { authMiddleware } from '../../middleware/auth.middleware.js';

function makeReqReply(headers: Record<string, string>): { req: any; reply: any } {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    sent: false,
  };
  const req: any = { headers };
  return { req, reply };
}

describe('authMiddleware — AUTH_DISABLED branch', () => {
  beforeEach(() => mockConfig.mockReset());

  it('honors x-tenant-id header instead of forcing dev-tenant', async () => {
    mockConfig.mockReturnValue({ AUTH_DISABLED: true });
    const { req, reply } = makeReqReply({ 'x-tenant-id': 'pilot' });
    await authMiddleware(req, reply);
    expect(req.user.tenantId).toBe('pilot');
  });

  it('falls back to dev-tenant when no header is provided', async () => {
    mockConfig.mockReturnValue({ AUTH_DISABLED: true });
    const { req, reply } = makeReqReply({});
    await authMiddleware(req, reply);
    expect(req.user.tenantId).toBe('dev-tenant');
  });

  it('uses API-key prefix as sub when available', async () => {
    mockConfig.mockReturnValue({ AUTH_DISABLED: true });
    const { req, reply } = makeReqReply({ 'x-api-key': 'shiron-abc123', 'x-tenant-id': 'pilot' });
    await authMiddleware(req, reply);
    expect(req.user.sub).toBe('shiron');
    expect(req.user.tenantId).toBe('pilot');
  });

  it('keeps admin role so existing /admin endpoints still work', async () => {
    mockConfig.mockReturnValue({ AUTH_DISABLED: true });
    const { req, reply } = makeReqReply({});
    await authMiddleware(req, reply);
    expect(req.user.roles).toContain('admin');
  });

  it('handles array-form tenant/key headers by taking the first value', async () => {
    mockConfig.mockReturnValue({ AUTH_DISABLED: true });
    const { req, reply } = makeReqReply({} as any);
    req.headers['x-tenant-id'] = ['pilot', 'alt'];
    req.headers['x-api-key'] = ['roey-xyz', 'shiron-xyz'];
    await authMiddleware(req as FastifyRequest, reply as unknown as FastifyReply);
    expect(req.user.tenantId).toBe('pilot');
    expect(req.user.sub).toBe('roey');
  });
});
