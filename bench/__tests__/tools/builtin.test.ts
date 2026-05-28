import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeBuiltinTools } from '../../tools/builtin.js';

describe('builtin sandbox tools', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'eam-bench-'));
    mkdirSync(join(sandbox, 'src'), { recursive: true });
    writeFileSync(join(sandbox, 'src/hello.ts'), 'export const greet = "hi"\n');
    writeFileSync(join(sandbox, 'src/other.ts'), 'export const farewell = "bye"\n');
  });

  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  it('read returns file contents from inside the sandbox', async () => {
    const tools = makeBuiltinTools(sandbox);
    const out = await tools.read({ path: 'src/hello.ts' });
    expect(out).toContain('greet');
  });

  it('read truncates large files', async () => {
    const big = 'x'.repeat(20_000);
    writeFileSync(join(sandbox, 'big.txt'), big);
    const tools = makeBuiltinTools(sandbox);
    const out = await tools.read({ path: 'big.txt' });
    expect(out.length).toBeLessThan(big.length);
    expect(out).toContain('truncated');
  });

  it('read rejects paths escaping the sandbox', async () => {
    const tools = makeBuiltinTools(sandbox);
    await expect(tools.read({ path: '../../etc/passwd' })).rejects.toThrow(/escape|outside/i);
  });

  it('read rejects absolute paths', async () => {
    const tools = makeBuiltinTools(sandbox);
    await expect(tools.read({ path: '/etc/passwd' })).rejects.toThrow(/absolute/i);
  });

  it('grep finds matching lines', async () => {
    const tools = makeBuiltinTools(sandbox);
    const out = await tools.grep({ pattern: 'greet' });
    expect(out).toContain('hello.ts');
    expect(out).toContain('greet');
  });

  it('bash allows ls', async () => {
    const tools = makeBuiltinTools(sandbox);
    const out = await tools.bash({ cmd: 'ls src' });
    expect(out).toContain('hello.ts');
    expect(out).toContain('other.ts');
  });

  it('bash rejects unlisted commands', async () => {
    const tools = makeBuiltinTools(sandbox);
    await expect(tools.bash({ cmd: 'rm -rf /' })).rejects.toThrow(/not allowed/i);
    await expect(tools.bash({ cmd: 'curl example.com' })).rejects.toThrow(/not allowed/i);
  });

  it('bash cat reads a sandbox file', async () => {
    const tools = makeBuiltinTools(sandbox);
    const out = await tools.bash({ cmd: 'cat src/hello.ts' });
    expect(out).toContain('greet');
  });
});
