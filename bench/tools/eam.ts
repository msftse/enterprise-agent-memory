// Bridges the benchmark agent to the deployed eam service.
// Re-uses the MCP package's recall path so the benchmark exercises
// the same code Claude Code would.

import { loadConfig } from '../../mcp/src/config.js';
import { getApiKey } from '../../mcp/src/auth.js';
import { ApiClient } from '../../mcp/src/api.js';
import { recallTool } from '../../mcp/src/tools/recall.js';

export interface EamTools {
  eam_recall: (args: { query: string; k?: number }) => Promise<string>;
}

export function makeEamTools(): EamTools {
  const cfg = loadConfig();
  const api = new ApiClient({
    baseUrl: cfg.apiUrl,
    tenant: cfg.tenantHeader,
    apiKey: getApiKey(),
  });
  const recall = recallTool(api);
  return {
    async eam_recall(args) {
      const hits = await recall(args);
      if (hits.length === 0) return '(no recalls)';
      return hits
        .map((h, i) => `[${i + 1}] (score ${h.score.toFixed(2)}) ${h.title}\n${h.content}`)
        .join('\n\n');
    },
  };
}
