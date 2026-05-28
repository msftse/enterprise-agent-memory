import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../src/config.js';
import { DEFAULTS } from '../src/defaults.js';

describe('loadConfig', () => {
  let tmpHome: string;
  const origEnv = { ...process.env };

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'eam-cfg-'));
    process.env = { ...origEnv };
    process.env.HOME = tmpHome;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.EAM_API_URL;
    delete process.env.EAM_API_KEY;
    delete process.env.EAM_TENANT;
  });

  afterEach(() => {
    process.env = origEnv;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('falls back to baked-in defaults when nothing else is set', () => {
    const cfg = loadConfig();
    expect(cfg.apiUrl).toBe(DEFAULTS.apiUrl);
    expect(cfg.tenantHeader).toBe('pilot');
    expect(cfg.apiKey).toBe('');
  });

  it('file at ~/.config/eam-mcp/config.json overrides defaults', () => {
    const dir = join(tmpHome, '.config', 'eam-mcp');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({
        apiUrl: 'https://override.example',
        apiKey: 'k1',
      }),
    );
    const cfg = loadConfig();
    expect(cfg.apiUrl).toBe('https://override.example');
    expect(cfg.apiKey).toBe('k1');
  });

  it('env vars override the file', () => {
    const dir = join(tmpHome, '.config', 'eam-mcp');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'config.json'),
      JSON.stringify({ apiUrl: 'https://from-file.example', apiKey: 'file-key' }),
    );
    process.env.EAM_API_URL = 'https://from-env.example';
    process.env.EAM_API_KEY = 'env-key';
    const cfg = loadConfig();
    expect(cfg.apiUrl).toBe('https://from-env.example');
    expect(cfg.apiKey).toBe('env-key');
  });

  it('returns the cacheDir path under HOME', () => {
    const cfg = loadConfig();
    expect(cfg.cacheDir).toBe(join(tmpHome, '.config', 'eam-mcp'));
  });

  it('creates the cacheDir if it does not exist', () => {
    const cfg = loadConfig();
    expect(() => writeFileSync(join(cfg.cacheDir, 'probe.txt'), 'x')).not.toThrow();
  });
});
