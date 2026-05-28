import { loadConfig } from './config.js';

export class AuthMissingError extends Error {
  constructor() {
    super('API key not configured. Run `eam-mcp configure --key <KEY>` in your terminal.');
    this.name = 'AuthMissingError';
  }
}

export function getApiKey(): string {
  const cfg = loadConfig();
  if (!cfg.apiKey) throw new AuthMissingError();
  return cfg.apiKey;
}
