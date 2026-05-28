import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthenticatedUser } from './auth.middleware.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = request.user as AuthenticatedUser | undefined;
  if (!user?.tenantId) {
    reply.code(403).send({
      error: {
        code: 'MISSING_TENANT',
        message: 'No tenant context',
        status: 403,
      },
    });
    return;
  }
  request.tenantId = user.tenantId;
}
