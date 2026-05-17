// ---------------------------------------------------------------------------
// Enterprise Agent Memory — Azure Configuration (Zod-validated)
// ---------------------------------------------------------------------------

import { z } from 'zod';

// Treat empty strings as undefined so optional URL fields don't fail validation
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);

const envSchema = z.object({
  // Azure Identity
  AZURE_TENANT_ID: z.string().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
  AZURE_CLIENT_SECRET: z.string().optional(),

  // Cosmos DB
  COSMOS_ENDPOINT: z.string().url(),
  COSMOS_DATABASE: z.string().default('agentmemory'),

  // Azure AI Search
  AI_SEARCH_ENDPOINT: z.string().url(),
  AI_SEARCH_INDEX: z.string().default('agent-memory'),
  AI_SEARCH_ADMIN_KEY: z.string().optional(),

  // Azure OpenAI (optional — can use API key with external endpoint)
  AZURE_OPENAI_ENDPOINT: optionalUrl,
  AZURE_OPENAI_DEPLOYMENT_CHAT: z.string().default('gpt-4o'),
  AZURE_OPENAI_DEPLOYMENT_EMBEDDING: z.string().default('text-embedding-3-large'),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-12-01-preview'),

  // Blob Storage
  STORAGE_ACCOUNT_URL: z.string().url(),
  STORAGE_AUDIT_CONTAINER: z.string().default('audit-logs'),
  STORAGE_RAW_CONTAINER: z.string().default('raw-observations'),

  // Microsoft Fabric (optional — OneLake sync)
  FABRIC_ENABLED: z.coerce.boolean().default(false),
  FABRIC_ONELAKE_ENDPOINT: optionalUrl,
  FABRIC_WORKSPACE_ID: z.string().optional(),
  FABRIC_LAKEHOUSE_ID: z.string().optional(),

  // App
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(100),

  // Auth
  AUTH_AUDIENCE: z.string().optional(),
  AUTH_ISSUER: z.string().optional(),
  AUTH_DISABLED: z.coerce.boolean().default(false),
});

export type AzureConfig = z.infer<typeof envSchema>;

let _config: AzureConfig | null = null;

export function loadConfig(): AzureConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${missing}`);
  }

  _config = result.data;
  return _config;
}

export function getConfig(): AzureConfig {
  if (!_config) throw new Error('Config not loaded — call loadConfig() first');
  return _config;
}
