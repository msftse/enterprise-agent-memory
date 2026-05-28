import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS } from './defaults.js';

function homeDir(): string {
  // HOME env var beats os.homedir() so tests can isolate via tmpdir.
  return process.env.HOME || homedir();
}

export interface EamConfig {
  apiUrl: string;
  tenantHeader: string;
  apiKey: string;
  cacheDir: string;
}

interface FileConfig {
  apiUrl?: string;
  tenantHeader?: string;
  apiKey?: string;
}

function resolveCacheDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homeDir(), '.config');
  return join(base, 'eam-mcp');
}

function readFileConfig(dir: string): FileConfig {
  const path = join(dir, 'config.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FileConfig;
  } catch {
    return {};
  }
}

export function loadConfig(): EamConfig {
  const cacheDir = resolveCacheDir();
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const file = readFileConfig(cacheDir);

  return {
    apiUrl: process.env.EAM_API_URL ?? file.apiUrl ?? DEFAULTS.apiUrl,
    tenantHeader:
      process.env.EAM_TENANT ?? file.tenantHeader ?? DEFAULTS.tenantHeader,
    apiKey: process.env.EAM_API_KEY ?? file.apiKey ?? '',
    cacheDir,
  };
}
