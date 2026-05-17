import type { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import { getConfig } from '../config/azure.config.js';

export interface AuthenticatedUser {
  sub: string;
  tenantId: string;
  roles: string[];
  name?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// Cache JWKS for performance
let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS(): ReturnType<typeof jose.createRemoteJWKSet> {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(
      new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
    );
  }
  return jwks;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const config = getConfig();

  // Skip auth in dev mode if AUTH_DISABLED
  if (config.AUTH_DISABLED) {
    request.user = {
      sub: 'dev-user',
      tenantId: 'dev-tenant',
      roles: ['admin'],
      name: 'Development User',
    };
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
        status: 401,
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jose.jwtVerify(token, getJWKS(), {
      issuer: config.AUTH_ISSUER || undefined,
      audience: config.AUTH_AUDIENCE || undefined,
    });

    const roles = (payload.roles as string[]) ?? [];
    const tenantId =
      (payload as any).tid ?? (payload as any).tenantId ?? '';

    if (!tenantId) {
      reply.code(403).send({
        error: {
          code: 'MISSING_TENANT',
          message: 'Token missing tenant ID claim',
          status: 403,
        },
      });
      return;
    }

    request.user = {
      sub: payload.sub ?? '',
      tenantId,
      roles,
      name: (payload as any).name,
    };
  } catch {
    reply.code(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token validation failed',
        status: 401,
      },
    });
  }
}

// RBAC helper
export function requireRole(...allowedRoles: string[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
          status: 401,
        },
      });
      return;
    }

    const hasRole = user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `Requires role: ${allowedRoles.join(' or ')}`,
          status: 403,
        },
      });
    }
  };
}
