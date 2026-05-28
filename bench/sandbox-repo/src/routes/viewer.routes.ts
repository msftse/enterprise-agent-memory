import { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find the viewer directory in dev or prod layout.
function viewerRoot(): string {
  const candidates = [
    join(__dirname, '..', 'viewer'),                    // dev: src/routes/../viewer
    join(__dirname, '..', '..', 'src', 'viewer'),       // prod: dist/../src/viewer
    join(__dirname, '..', '..', 'viewer'),              // prod alt
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'index.html'))) return p;
  }
  return candidates[0]; // fallback; downstream 404s if files truly missing
}

export async function registerViewerRoutes(app: FastifyInstance): Promise<void> {
  const root = viewerRoot();
  await app.register(fastifyStatic, {
    root,
    prefix: '/viewer/',
    decorateReply: false,
  });

  // /viewer (no trailing slash) serves index.html
  app.get('/viewer', async (_request, reply) => {
    return reply.sendFile('index.html');
  });

  app.get('/', async (_request, reply) => {
    reply.redirect('/viewer');
  });
}
