import { AuthMissingError } from './auth.js';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOpts {
  baseUrl: string;
  tenant: string;
  apiKey: string;
  fetch?: FetchLike;
  retryDelayMs?: number;
}

export class ApiClient {
  constructor(private opts: ApiClientOpts) {}

  private async request(
    path: string,
    init: RequestInit = {},
    isRetry = false,
  ): Promise<unknown> {
    const fetcher = this.opts.fetch ?? (globalThis.fetch as FetchLike);
    const headers = new Headers(init.headers);
    headers.set('x-api-key', this.opts.apiKey);
    headers.set('x-tenant-id', this.opts.tenant);
    headers.set('content-type', 'application/json');

    const res = await fetcher(this.opts.baseUrl + path, { ...init, headers });

    if (res.status === 401) {
      throw new AuthMissingError();
    }
    if (res.status >= 500 && !isRetry) {
      await new Promise((r) => setTimeout(r, this.opts.retryDelayMs ?? 500));
      return this.request(path, init, true);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.request(path) as Promise<T>;
  }

  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }) as Promise<T>;
  }
}
