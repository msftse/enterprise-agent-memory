// Sandboxed read/grep/bash for the benchmark agent loop.
// Every path is resolved against `sandboxRoot` and refused if it escapes.
// Bash is whitelisted to ls/cat/head/wc.

import { readFile } from 'node:fs/promises';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, relative, isAbsolute } from 'node:path';

const execFile = promisify(execFileCb);

const BASH_WHITELIST = new Set(['ls', 'cat', 'head', 'wc']);
const MAX_READ_BYTES = 8192;
const MAX_GREP_BUFFER = 1024 * 1024;

function safeJoin(sandboxRoot: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error('Path escape: absolute paths are not allowed');
  const full = resolve(sandboxRoot, rel);
  const within = relative(sandboxRoot, full);
  if (within.startsWith('..') || isAbsolute(within)) {
    throw new Error('Path escape: path leaves the sandbox');
  }
  return full;
}

export interface BuiltinTools {
  read: (args: { path: string }) => Promise<string>;
  grep: (args: { pattern: string; path?: string }) => Promise<string>;
  bash: (args: { cmd: string }) => Promise<string>;
}

export function makeBuiltinTools(sandboxRoot: string): BuiltinTools {
  return {
    async read({ path }) {
      const p = safeJoin(sandboxRoot, path);
      const buf = await readFile(p, 'utf8');
      if (buf.length > MAX_READ_BYTES) {
        return `${buf.slice(0, MAX_READ_BYTES)}\n... [truncated; original ${buf.length} bytes]`;
      }
      return buf;
    },

    async grep({ pattern, path }) {
      const target = path ? safeJoin(sandboxRoot, path) : sandboxRoot;
      // Prefer ripgrep; fall back to grep -rn if not available.
      try {
        const { stdout } = await execFile(
          'rg',
          ['--no-heading', '--max-count', '100', pattern, target],
          { maxBuffer: MAX_GREP_BUFFER },
        );
        return stdout || '(no matches)';
      } catch {
        try {
          const { stdout } = await execFile('grep', ['-rn', '--', pattern, target], {
            maxBuffer: MAX_GREP_BUFFER,
          });
          return stdout || '(no matches)';
        } catch (e: any) {
          return e?.stdout || '(no matches)';
        }
      }
    },

    async bash({ cmd }) {
      const parts = cmd.trim().split(/\s+/);
      const program = parts[0];
      if (!BASH_WHITELIST.has(program)) {
        throw new Error(`Command not allowed: ${program}`);
      }
      // Translate relative path args into safe-joined absolute paths.
      const args = parts.slice(1).map((a) => {
        // Skip flags
        if (a.startsWith('-')) return a;
        return safeJoin(sandboxRoot, a);
      });
      const { stdout } = await execFile(program, args, { maxBuffer: MAX_GREP_BUFFER });
      return stdout;
    },
  };
}
