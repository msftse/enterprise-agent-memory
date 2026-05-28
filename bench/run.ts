// CLI: `npx tsx bench/run.ts [--task=NAME] [--no-post]`
//
// Loads bench/tasks/*.yaml. For each task, runs the agent twice (toolsetA
// baseline, toolsetB with memory recall), measures total tokens, optionally
// POSTs the run to /api/v1/benchmarks.
//
// Requires Azure OpenAI env vars (same as the server): AZURE_OPENAI_ENDPOINT,
// AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_DEPLOYMENT_CHAT.
// Requires eam-mcp to be configured (the local config provides the API key).

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { AzureOpenAI } from 'openai';

import { runAgent, type AgentOpts } from './agent.js';
import { makeBuiltinTools } from './tools/builtin.js';
import { makeEamTools } from './tools/eam.js';
import { loadConfig } from '../mcp/src/config.js';
import { getApiKey } from '../mcp/src/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TaskYaml {
  name: string;
  description?: string;
  prompt: string;
  toolsetA: string[];
  toolsetB: string[];
  stopWhen: { containsAny: string[]; orAfterTurns: number };
}

function buildToolSchemas(names: string[]): any[] {
  const all: Record<string, any> = {
    read: {
      type: 'function',
      function: {
        name: 'read',
        description: 'Read a file from the sandbox repo. Path is relative.',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    },
    grep: {
      type: 'function',
      function: {
        name: 'grep',
        description: 'Search the sandbox repo with ripgrep. Optional path filter.',
        parameters: {
          type: 'object',
          properties: { pattern: { type: 'string' }, path: { type: 'string' } },
          required: ['pattern'],
        },
      },
    },
    bash: {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Run a whitelisted shell command (ls/cat/head/wc) against the sandbox repo.',
        parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] },
      },
    },
    eam_recall: {
      type: 'function',
      function: {
        name: 'eam_recall',
        description: 'Semantic recall over the deployed eam memory store. Returns top-k stored memories.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' }, k: { type: 'number' } },
          required: ['query'],
        },
      },
    },
  };
  return names.map((n) => all[n]).filter(Boolean);
}

function parseArgs() {
  const taskArg = process.argv.find((a) => a.startsWith('--task='));
  const taskFilter = taskArg ? taskArg.slice('--task='.length) : undefined;
  const noPost = process.argv.includes('--no-post');
  return { taskFilter, noPost };
}

async function postRun(apiUrl: string, apiKey: string, payload: any): Promise<void> {
  const res = await fetch(`${apiUrl}/api/v1/benchmarks`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'x-tenant-id': 'pilot',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /benchmarks ${res.status}: ${txt}`);
  }
}

async function main() {
  const cfg = loadConfig();
  const apiKey = getApiKey();
  const { taskFilter, noPost } = parseArgs();

  const azure = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_CHAT ?? 'gpt-4o',
  });

  const sandboxRoot = resolve(__dirname, 'sandbox-repo');
  const builtin = makeBuiltinTools(sandboxRoot);
  const eam = makeEamTools();
  const allTools = { ...builtin, ...eam };

  const taskFiles = readdirSync(join(__dirname, 'tasks'))
    .filter((f) => f.endsWith('.yaml'))
    .sort();
  const tasks = taskFiles
    .map((f) => parseYaml(readFileSync(join(__dirname, 'tasks', f), 'utf8')) as TaskYaml)
    .filter((t) => !taskFilter || t.name === taskFilter);

  if (tasks.length === 0) {
    process.stderr.write(`No tasks matched${taskFilter ? ` --task=${taskFilter}` : ''}.\n`);
    process.exit(2);
  }

  const results: any[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    process.stdout.write(`[${i + 1}/${tasks.length}] ${t.name}\n`);

    const baseOpts: Omit<AgentOpts, 'tools' | 'toolSchemas'> = {
      openai: azure as any,
      model: process.env.AZURE_OPENAI_DEPLOYMENT_CHAT ?? 'gpt-4o',
      messages: [{ role: 'user', content: t.prompt }],
      stopWhen: t.stopWhen,
    };

    const baseline = await runAgent({
      ...baseOpts,
      tools: allTools,
      toolSchemas: buildToolSchemas(t.toolsetA),
    });
    const baseTotal = baseline.promptTokens + baseline.completionTokens;
    process.stdout.write(
      `  baseline:   ${baseline.promptTokens} + ${baseline.completionTokens} = ${baseTotal} (${baseline.turns} turns)\n`,
    );

    const withMem = await runAgent({
      ...baseOpts,
      tools: allTools,
      toolSchemas: buildToolSchemas(t.toolsetB),
    });
    const memTotal = withMem.promptTokens + withMem.completionTokens;
    process.stdout.write(
      `  withMemory: ${withMem.promptTokens} + ${withMem.completionTokens} = ${memTotal} (${withMem.turns} turns)\n`,
    );

    const deltaTokens = memTotal - baseTotal;
    const deltaPct = baseTotal > 0 ? (deltaTokens / baseTotal) * 100 : 0;
    process.stdout.write(`  Δ ${deltaTokens} tokens (${deltaPct.toFixed(1)}%)\n`);

    results.push({
      taskName: t.name,
      baseline: {
        promptTokens: baseline.promptTokens,
        completionTokens: baseline.completionTokens,
        turns: baseline.turns,
      },
      withMemory: {
        promptTokens: withMem.promptTokens,
        completionTokens: withMem.completionTokens,
        turns: withMem.turns,
      },
      deltaTokens,
      deltaPct,
    });
  }

  const totalBase = results.reduce((s, r) => s + r.baseline.promptTokens + r.baseline.completionTokens, 0);
  const totalMem = results.reduce((s, r) => s + r.withMemory.promptTokens + r.withMemory.completionTokens, 0);

  const payload = {
    id: randomUUID(),
    ranAt: new Date().toISOString(),
    actor: apiKey.split('-', 2)[0] || 'unknown',
    modelDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_CHAT ?? 'gpt-4o',
    results,
    summary: {
      totalBaselineTokens: totalBase,
      totalWithMemoryTokens: totalMem,
      avgDeltaPct: results.reduce((s, r) => s + r.deltaPct, 0) / results.length,
    },
  };

  if (noPost) {
    process.stdout.write(`✓ ${tasks.length} task(s) complete (dry-run; not posted).\n`);
    process.stdout.write(JSON.stringify(payload.summary, null, 2) + '\n');
    return;
  }

  await postRun(cfg.apiUrl, apiKey, payload);
  process.stdout.write(`✓ ${tasks.length} task(s) complete. Posted run ${payload.id} to ${cfg.apiUrl}.\n`);
}

main().catch((e) => {
  process.stderr.write(`✗ ${(e as Error).stack ?? e}\n`);
  process.exit(1);
});
