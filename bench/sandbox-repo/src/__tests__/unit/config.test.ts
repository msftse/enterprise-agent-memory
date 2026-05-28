import { describe, it, expect, beforeEach, vi } from 'vitest';

const VALID_ENV = {
  COSMOS_ENDPOINT: 'https://test.documents.azure.com:443/',
  AI_SEARCH_ENDPOINT: 'https://test.search.windows.net',
  STORAGE_ACCOUNT_URL: 'https://teststorage.blob.core.windows.net',
};

describe('azure.config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  describe('loadConfig', () => {
    it('loads valid config with all required fields', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.COSMOS_ENDPOINT).toBe(VALID_ENV.COSMOS_ENDPOINT);
      expect(config.AI_SEARCH_ENDPOINT).toBe(VALID_ENV.AI_SEARCH_ENDPOINT);
      expect(config.STORAGE_ACCOUNT_URL).toBe(VALID_ENV.STORAGE_ACCOUNT_URL);
    });

    it('applies default values for optional fields', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.PORT).toBe(8080);
      expect(config.LOG_LEVEL).toBe('info');
      expect(config.COSMOS_DATABASE).toBe('agentmemory');
      expect(config.RATE_LIMIT_PER_MINUTE).toBe(100);
      expect(config.AUTH_DISABLED).toBe(false);
      expect(config.AI_SEARCH_INDEX).toBe('agent-memory');
      expect(config.AZURE_OPENAI_DEPLOYMENT_CHAT).toBe('gpt-4o');
      expect(config.AZURE_OPENAI_DEPLOYMENT_EMBEDDING).toBe('text-embedding-3-large');
      expect(config.STORAGE_AUDIT_CONTAINER).toBe('audit-logs');
      expect(config.STORAGE_RAW_CONTAINER).toBe('raw-observations');
    });

    it('throws when required COSMOS_ENDPOINT is missing', async () => {
      vi.stubEnv('AI_SEARCH_ENDPOINT', VALID_ENV.AI_SEARCH_ENDPOINT);
      vi.stubEnv('STORAGE_ACCOUNT_URL', VALID_ENV.STORAGE_ACCOUNT_URL);

      const { loadConfig } = await import('../../config/azure.config.js');
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('throws when required AI_SEARCH_ENDPOINT is missing', async () => {
      vi.stubEnv('COSMOS_ENDPOINT', VALID_ENV.COSMOS_ENDPOINT);
      vi.stubEnv('STORAGE_ACCOUNT_URL', VALID_ENV.STORAGE_ACCOUNT_URL);

      const { loadConfig } = await import('../../config/azure.config.js');
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('throws when required STORAGE_ACCOUNT_URL is missing', async () => {
      vi.stubEnv('COSMOS_ENDPOINT', VALID_ENV.COSMOS_ENDPOINT);
      vi.stubEnv('AI_SEARCH_ENDPOINT', VALID_ENV.AI_SEARCH_ENDPOINT);

      const { loadConfig } = await import('../../config/azure.config.js');
      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('treats empty string AZURE_OPENAI_ENDPOINT as undefined', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);
      vi.stubEnv('AZURE_OPENAI_ENDPOINT', '');

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.AZURE_OPENAI_ENDPOINT).toBeUndefined();
    });

    it('treats whitespace-only AZURE_OPENAI_ENDPOINT as undefined', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);
      vi.stubEnv('AZURE_OPENAI_ENDPOINT', '   ');

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.AZURE_OPENAI_ENDPOINT).toBeUndefined();
    });

    it('accepts valid AZURE_OPENAI_ENDPOINT URL', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);
      vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://myopenai.openai.azure.com/');

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.AZURE_OPENAI_ENDPOINT).toBe('https://myopenai.openai.azure.com/');
    });

    it('coerces PORT from string to number', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);
      vi.stubEnv('PORT', '3000');

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.PORT).toBe(3000);
    });

    it('coerces AUTH_DISABLED from string to boolean', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);
      vi.stubEnv('AUTH_DISABLED', 'true');

      const { loadConfig } = await import('../../config/azure.config.js');
      const config = loadConfig();

      expect(config.AUTH_DISABLED).toBe(true);
    });

    it('caches config on repeated calls', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);

      const { loadConfig } = await import('../../config/azure.config.js');
      const c1 = loadConfig();
      const c2 = loadConfig();

      expect(c1).toBe(c2);
    });
  });

  describe('getConfig', () => {
    it('throws if loadConfig has not been called', async () => {
      const { getConfig } = await import('../../config/azure.config.js');
      expect(() => getConfig()).toThrow('Config not loaded');
    });

    it('returns config after loadConfig', async () => {
      for (const [k, v] of Object.entries(VALID_ENV)) vi.stubEnv(k, v);

      const { loadConfig, getConfig } = await import('../../config/azure.config.js');
      loadConfig();

      const config = getConfig();
      expect(config.COSMOS_ENDPOINT).toBe(VALID_ENV.COSMOS_ENDPOINT);
    });
  });
});
