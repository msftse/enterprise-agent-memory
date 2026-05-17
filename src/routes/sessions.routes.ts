import type { FastifyInstance } from 'fastify';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { Session } from '../types/models.js';
import type { CreateSessionRequest, UpdateSessionRequest, ListParams } from '../types/api.js';
import { nanoid } from 'nanoid';

export function registerSessionRoutes(app: FastifyInstance, cosmos: CosmosAdapter): void {
  // POST /api/v1/sessions — create session
  app.post<{ Body: CreateSessionRequest }>('/api/v1/sessions', async (request, reply) => {
    const tenantId = request.tenantId;
    const body = request.body;
    const now = new Date().toISOString();

    const session: Session = {
      id: nanoid(),
      tenantId,
      project: body.project,
      cwd: body.cwd,
      startedAt: now,
      status: 'active',
      observationCount: 0,
      model: body.model,
      tags: body.tags,
      firstPrompt: body.firstPrompt,
    };

    await cosmos.create('sessions', session);
    reply.code(201).send({
      data: session,
      meta: { requestId: nanoid(), timestamp: now, tenantId },
    });
  });

  // GET /api/v1/sessions — list sessions
  app.get<{ Querystring: ListParams }>('/api/v1/sessions', async (request, reply) => {
    const { offset = 0, limit = 50, project, status } = request.query;
    const parsedOffset = Number(offset);
    const parsedLimit = Number(limit);
    const filters: Record<string, unknown>[] = [];
    const parameters: { name: string; value: string | number }[] = [
      { name: '@tenantId', value: request.tenantId },
      { name: '@offset', value: parsedOffset },
      { name: '@limit', value: parsedLimit },
    ];

    if (project) {
      filters.push({ clause: 'c.project = @project' });
      parameters.push({ name: '@project', value: project });
    }
    if (status) {
      filters.push({ clause: 'c.status = @status' });
      parameters.push({ name: '@status', value: status });
    }

    const whereExtra = filters.length > 0
      ? ` AND ${filters.map((f) => f.clause as string).join(' AND ')}`
      : '';

    const items = await cosmos.query<Session>('sessions', {
      query: `SELECT * FROM c WHERE c.tenantId = @tenantId${whereExtra} ORDER BY c.startedAt DESC OFFSET @offset LIMIT @limit`,
      parameters,
    });

    const countResult = await cosmos.query<number>('sessions', {
      query: `SELECT VALUE COUNT(1) FROM c WHERE c.tenantId = @tenantId${whereExtra}`,
      parameters: parameters.filter((p) => p.name !== '@offset' && p.name !== '@limit'),
    });
    const total = countResult[0] ?? 0;

    reply.send({
      data: { items, total, offset, limit, hasMore: offset + limit < total },
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
    });
  });

  // GET /api/v1/sessions/:id
  app.get<{ Params: { id: string } }>('/api/v1/sessions/:id', async (request, reply) => {
    const session = await cosmos.read<Session>('sessions', request.params.id, request.tenantId);
    if (!session) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Session not found', status: 404 },
      });
    }
    reply.send({
      data: session,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
    });
  });

  // PATCH /api/v1/sessions/:id
  app.patch<{ Params: { id: string }; Body: UpdateSessionRequest }>(
    '/api/v1/sessions/:id',
    async (request, reply) => {
      const session = await cosmos.read<Session>('sessions', request.params.id, request.tenantId);
      if (!session) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Session not found', status: 404 },
        });
      }

      if (request.body.status) session.status = request.body.status;
      if (request.body.tags) session.tags = request.body.tags;
      if (request.body.summary) session.summary = request.body.summary;

      await cosmos.update('sessions', session);
      reply.send({
        data: session,
        meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
      });
    },
  );

  // POST /api/v1/sessions/:id/end
  app.post<{ Params: { id: string } }>('/api/v1/sessions/:id/end', async (request, reply) => {
    const session = await cosmos.read<Session>('sessions', request.params.id, request.tenantId);
    if (!session) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Session not found', status: 404 },
      });
    }

    session.status = 'completed';
    session.endedAt = new Date().toISOString();
    await cosmos.update('sessions', session);
    reply.send({
      data: session,
      meta: { requestId: nanoid(), timestamp: new Date().toISOString(), tenantId: request.tenantId },
    });
  });
}
