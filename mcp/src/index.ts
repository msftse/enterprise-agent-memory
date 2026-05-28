import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { loadConfig } from './config.js';
import { getApiKey } from './auth.js';
import { ApiClient } from './api.js';
import { rememberTool, RememberInput } from './tools/remember.js';
import { recallTool, RecallInput } from './tools/recall.js';
import { listRecentTool, ListRecentInput } from './tools/list-recent.js';

export async function runServer(): Promise<void> {
  const cfg = loadConfig();
  const api = new ApiClient({
    baseUrl: cfg.apiUrl,
    tenant: cfg.tenantHeader,
    apiKey: getApiKey(),
  });

  const remember = rememberTool(api);
  const recall = recallTool(api);
  const listRecent = listRecentTool(api);

  const server = new Server(
    { name: 'eam-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'remember',
        description:
          'Persist a memory the agent will be able to recall later. Provide the content (required); type/title/concepts/files are optional and inferred when omitted.',
        inputSchema: zodToJsonSchema(RememberInput) as Record<string, unknown>,
      },
      {
        name: 'recall',
        description:
          'Semantic search over stored memories. Returns the top-k matches scored by hybrid BM25 + vector similarity.',
        inputSchema: zodToJsonSchema(RecallInput) as Record<string, unknown>,
      },
      {
        name: 'list_recent',
        description: 'List recently stored memories in descending order of createdAt.',
        inputSchema: zodToJsonSchema(ListRecentInput) as Record<string, unknown>,
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    let result: unknown;
    try {
      if (name === 'remember') result = await remember(args);
      else if (name === 'recall') result = await recall(args);
      else if (name === 'list_recent') result = await listRecent(args);
      else throw new Error(`Unknown tool: ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `error: ${msg}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  await server.connect(new StdioServerTransport());
}
