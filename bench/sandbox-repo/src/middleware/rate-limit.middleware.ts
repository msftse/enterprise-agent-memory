import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '../config/azure.config.js';

export async function registerRateLimit(
  app: FastifyInstance,
): Promise<void> {
  const config = getConfig();
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Rate limit per tenant
      return (request as any).tenantId ?? request.ip;
    },
  });
}
