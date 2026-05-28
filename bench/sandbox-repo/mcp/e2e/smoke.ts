import { loadConfig } from '../src/config.js';
import { getApiKey } from '../src/auth.js';
import { ApiClient } from '../src/api.js';
import { rememberTool } from '../src/tools/remember.js';
import { recallTool } from '../src/tools/recall.js';

async function main() {
  const cfg = loadConfig();
  const api = new ApiClient({
    baseUrl: cfg.apiUrl,
    tenant: cfg.tenantHeader,
    apiKey: getApiKey(),
  });
  const remember = rememberTool(api);
  const recall = recallTool(api);

  const marker = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const probe = `End-to-end smoke marker: ${marker}. The pilot uses API-key auth and tenantId=pilot.`;

  process.stdout.write(`→ writing memory: ${probe}\n`);
  const wrote = await remember({ content: probe, type: 'fact', concepts: ['smoke', marker] });
  process.stdout.write(`  memoryId=${wrote.memoryId} title="${wrote.title}"\n`);

  process.stdout.write(`→ waiting 5s for indexing\n`);
  await new Promise((r) => setTimeout(r, 5000));

  process.stdout.write(`→ recalling with the marker token\n`);
  const hits = await recall({ query: marker, k: 5 });
  const found = hits.some((h) => h.content.includes(marker));

  if (!found) {
    process.stderr.write(`✗ marker not found in top-5 hits\n`);
    process.stderr.write(JSON.stringify(hits, null, 2) + '\n');
    process.exit(1);
  }
  process.stdout.write(`✓ smoke passed: marker appeared in recall results (${hits.length} hits)\n`);
}

main().catch((e) => {
  process.stderr.write(`✗ ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
