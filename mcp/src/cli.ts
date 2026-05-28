#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadConfig } from './config.js';
import { getApiKey, AuthMissingError } from './auth.js';
import { runServer } from './index.js';

function parseFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1];
}

async function promptHidden(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(label);
  rl.close();
  return answer.trim();
}

async function cmdConfigure(): Promise<void> {
  const cfg = loadConfig();
  let key = parseFlag('--key');
  if (!key) key = await promptHidden('API key: ');
  if (!key) {
    process.stderr.write('error: empty key\n');
    process.exit(2);
  }
  const cfgPath = join(cfg.cacheDir, 'config.json');
  const existing = existsSync(cfgPath)
    ? (JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>)
    : {};
  const next = { ...existing, apiKey: key };
  writeFileSync(cfgPath, JSON.stringify(next, null, 2), { mode: 0o600 });
  process.stderr.write(`✓ Key saved to ${cfgPath}\n`);
}

async function cmdLogout(): Promise<void> {
  const cfg = loadConfig();
  const cfgPath = join(cfg.cacheDir, 'config.json');
  if (existsSync(cfgPath)) {
    const existing = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
    delete existing.apiKey;
    writeFileSync(cfgPath, JSON.stringify(existing, null, 2), { mode: 0o600 });
  }
  process.stderr.write('✓ Logged out, key removed.\n');
}

async function cmdStatus(): Promise<void> {
  const cfg = loadConfig();
  process.stderr.write(`API URL:     ${cfg.apiUrl || '(not set)'}\n`);
  process.stderr.write(`Tenant:      ${cfg.tenantHeader}\n`);
  process.stderr.write(`Config dir:  ${cfg.cacheDir}\n`);
  try {
    const k = getApiKey();
    process.stderr.write(`API key:     configured (length ${k.length}, prefix ${k.split('-')[0]})\n`);
  } catch (e) {
    process.stderr.write(`API key:     ${(e as Error).message}\n`);
  }
  if (!cfg.apiUrl) {
    process.stderr.write('\n(Set EAM_API_URL or write ~/.config/eam-mcp/config.json with { "apiUrl": "..." })\n');
    return;
  }
  try {
    const res = await fetch(cfg.apiUrl + '/api/v1/health');
    process.stderr.write(`/health:     ${res.status} ${res.statusText}\n`);
  } catch (e) {
    process.stderr.write(`/health:     unreachable (${(e as Error).message})\n`);
  }
}

async function main() {
  const cmd = process.argv[2] ?? 'serve';
  switch (cmd) {
    case 'serve':
      await runServer();
      break;
    case 'configure':
      await cmdConfigure();
      break;
    case 'logout':
      await cmdLogout();
      break;
    case 'status':
      await cmdStatus();
      break;
    default:
      process.stderr.write('Usage: eam-mcp {serve|configure|logout|status}\n');
      process.exit(2);
  }
}

main().catch((e) => {
  const msg = e instanceof AuthMissingError ? e.message : (e as Error).message;
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
});
