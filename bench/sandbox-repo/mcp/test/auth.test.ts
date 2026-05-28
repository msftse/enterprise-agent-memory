import { describe, it, expect, vi } from 'vitest';

const mockConfig = vi.fn();
vi.mock('../src/config.js', () => ({
  loadConfig: vi.fn(() => mockConfig()),
}));

import { getApiKey, AuthMissingError } from '../src/auth.js';

describe('getApiKey', () => {
  it('returns the configured key', () => {
    mockConfig.mockReturnValue({ apiKey: 'roey-abc', apiUrl: 'x', tenantHeader: 'pilot', cacheDir: '/tmp' });
    expect(getApiKey()).toBe('roey-abc');
  });

  it('throws AuthMissingError with helpful message when key is empty', () => {
    mockConfig.mockReturnValue({ apiKey: '', apiUrl: 'x', tenantHeader: 'pilot', cacheDir: '/tmp' });
    expect(() => getApiKey()).toThrow(AuthMissingError);
    expect(() => getApiKey()).toThrow(/Run `eam-mcp configure/);
  });
});
