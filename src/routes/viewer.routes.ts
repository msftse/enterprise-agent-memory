import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedHtml: string | null = null;

function getViewerHtml(): string {
  if (!cachedHtml) {
    // Try multiple locations: dev (src/viewer) and production (viewer/ next to dist/)
    const paths = [
      join(__dirname, '..', 'viewer', 'index.html'),       // dev: src/routes/../viewer
      join(__dirname, '..', '..', 'src', 'viewer', 'index.html'),  // prod: dist/../src/viewer
      join(__dirname, '..', '..', 'viewer', 'index.html'),  // prod alt: dist/../viewer
    ];

    for (const p of paths) {
      try {
        cachedHtml = readFileSync(p, 'utf-8');
        return cachedHtml;
      } catch {
        // try next path
      }
    }

    cachedHtml = '<html><body><h1>Viewer not found</h1><p>The viewer HTML file could not be located.</p></body></html>';
  }
  return cachedHtml;
}

export function registerViewerRoutes(app: FastifyInstance): void {
  app.get('/viewer', async (_request, reply) => {
    reply.type('text/html').send(getViewerHtml());
  });

  app.get('/', async (_request, reply) => {
    reply.redirect('/viewer');
  });
}
