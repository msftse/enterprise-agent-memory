# eam-mcp

Claude Code MCP bridge for [enterprise-agent-memory](https://github.com/msftse/enterprise-agent-memory). Lets you write and recall memories from your Claude Code sessions against the shared Azure deployment.

## Install

```bash
npm i -g eam-mcp
```

Requires Node 22+.

## Configure (one-time)

Ask Roey for your API key (key prefix is your name — `roey-...` or `shiron-...`), then:

```bash
eam-mcp configure --key roey-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

The key is written to `~/.config/eam-mcp/config.json` (mode 0600). To rotate, run `configure` again.

## Wire into Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "eam": { "command": "eam-mcp", "args": ["serve"] }
  }
}
```

Restart Claude Code. Three new tools appear:

- `mcp__eam__remember` — persist a memory.
- `mcp__eam__recall` — semantic search over your memories.
- `mcp__eam__list_recent` — list recently stored memories.

## Verify

```bash
eam-mcp status
```

Prints API URL, tenant, configured-key prefix, and `/api/v1/health` status. If any of those are wrong, see Troubleshooting below.

## Smoke test

If you cloned the repo and have your key configured:

```bash
cd mcp
npm install
npm run smoke
```

Writes a one-time marker memory, waits 5s for indexing, recalls it. Exits 0 on success.

## Troubleshooting

**`API key not configured`** — run `eam-mcp configure --key <KEY>` again.

**`API 401`** — your key has been rotated/revoked. Ask Roey for the current key.

**`/health: 503`** — the upstream service has a degraded adapter (Cosmos / AI Search / Storage). Send the JSON body to Roey.

**Cannot reach API** — your `apiUrl` is wrong. Override via:

```bash
export EAM_API_URL=https://...
# or edit ~/.config/eam-mcp/config.json with { "apiUrl": "..." }
```

## Logout

```bash
eam-mcp logout
```

Wipes the local key. Server-side revocation requires removing the key from `EAM_API_KEYS` on the Container App (ask Roey).

## CLI reference

| Command | What it does |
|---|---|
| `eam-mcp serve` | Run as MCP stdio server (used by Claude Code). |
| `eam-mcp configure [--key K]` | Save your API key locally. Prompts if `--key` omitted. |
| `eam-mcp logout` | Remove the locally-cached key. |
| `eam-mcp status` | Diagnose: API URL, tenant, key state, `/health` reachable. |
