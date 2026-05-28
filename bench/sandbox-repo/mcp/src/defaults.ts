// Defaults are filled in after deployment (see scripts/write-defaults.sh).
// During development, override via env vars (EAM_API_URL, EAM_TENANT, EAM_API_KEY)
// or via the user's ~/.config/eam-mcp/config.json file written by `eam-mcp configure`.

export const DEFAULTS = {
  apiUrl: 'https://app-eampilot-dev.agreeableriver-38de458b.eastus2.azurecontainerapps.io',
  tenantHeader: 'pilot',
};
