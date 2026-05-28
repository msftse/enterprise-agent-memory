import { describe, it, expect, vi } from 'vitest';
import { ApiClient } from '../src/api.js';

function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[i++];
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
}

describe('ApiClient', () => {
  it('adds x-api-key and x-tenant-id headers', async () => {
    const f = fakeFetch([{ status: 200, body: { ok: true } }]);
    const client = new ApiClient({
      baseUrl: 'https://api.example',
      tenant: 'pilot',
      apiKey: 'roey-xyz',
      fetch: f,
    });
    await client.get('/foo');
    const init = f.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('x-api-key')).toBe('roey-xyz');
    expect(headers.get('x-tenant-id')).toBe('pilot');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('throws AuthMissingError on 401', async () => {
    const f = fakeFetch([{ status: 401, body: { error: 'nope' } }]);
    const client = new ApiClient({
      baseUrl: 'https://api.example',
      tenant: 'pilot',
      apiKey: 'bad',
      fetch: f,
    });
    await expect(client.get('/foo')).rejects.toThrow(/eam-mcp configure/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries once on 500 then succeeds', async () => {
    const f = fakeFetch([{ status: 500 }, { status: 200, body: { ok: true } }]);
    const client = new ApiClient({
      baseUrl: 'https://api.example',
      tenant: 'pilot',
      apiKey: 'k',
      fetch: f,
      retryDelayMs: 0,
    });
    const res = await client.get('/foo');
    expect(res).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('throws after two consecutive 500s', async () => {
    const f = fakeFetch([{ status: 500 }, { status: 503 }]);
    const client = new ApiClient({
      baseUrl: 'https://api.example',
      tenant: 'pilot',
      apiKey: 'k',
      fetch: f,
      retryDelayMs: 0,
    });
    await expect(client.get('/foo')).rejects.toThrow(/API 503/);
  });

  it('post() sends body as JSON', async () => {
    const f = fakeFetch([{ status: 200, body: { id: 'm1' } }]);
    const client = new ApiClient({
      baseUrl: 'https://api.example',
      tenant: 'pilot',
      apiKey: 'k',
      fetch: f,
    });
    const res = await client.post('/x', { content: 'hello' });
    expect(res).toEqual({ id: 'm1' });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ content: 'hello' }));
  });
});
