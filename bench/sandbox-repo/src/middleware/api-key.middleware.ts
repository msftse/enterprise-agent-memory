import type { FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config/azure.config.js';

export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { EAM_API_KEYS } = getConfig();
  if (EAM_API_KEYS.length === 0) return;

  const provided = request.headers['x-api-key'];
  if (typeof provided !== 'string' || !EAM_API_KEYS.includes(provided)) {
    reply.code(401).send({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Missing or invalid x-api-key header',
        status: 401,
      },
    });
  }
}
