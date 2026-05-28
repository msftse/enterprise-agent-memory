<p align="center">
  <img src="https://img.icons8.com/fluency/96/brain.png" alt="Enterprise Agent Memory" width="96" height="96" />
</p>

<h1 align="center">Enterprise Agent Memory</h1>

<p align="center">
  <strong>Persistent memory for AI coding agents — deployed on Azure, built for the enterprise.</strong><br/>
  Your coding agent remembers everything. No more re-explaining. No more context loss between sessions.<br/>
  Based on <a href="https://github.com/rohitg00/agentmemory">agentmemory</a>, re-engineered for Azure with multi-tenancy, managed services, and one-click deployment.
</p>

<p align="center">
  <a href="#deploy-to-azure"><img src="https://aka.ms/deploytoazurebutton" alt="Deploy to Azure" /></a>
</p>

<p align="center">
  <a href="https://github.com/msftse/enterprise-agent-memory/actions"><img src="https://img.shields.io/badge/tests-102%20passing-brightgreen?style=for-the-badge&logo=vitest&logoColor=white" alt="Tests" /></a>
  <a href="https://github.com/msftse/enterprise-agent-memory/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge" alt="License" /></a>
  <a href="#azure-services"><img src="https://img.shields.io/badge/Azure-6%20services-0078D4?style=for-the-badge&logo=microsoftazure&logoColor=white" alt="Azure" /></a>
  <a href="#real-time-dashboard"><img src="https://img.shields.io/badge/viewer-built--in-b11f4b?style=for-the-badge" alt="Viewer" /></a>
</p>

<p align="center">
  <a href="#install">Install</a> &bull;
  <a href="#deploy-to-azure">Deploy</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#works-with-every-agent">Agents</a> &bull;
  <a href="#real-time-dashboard">Viewer</a> &bull;
  <a href="#api-reference">API</a> &bull;
  <a href="#vs-the-original">vs Original</a> &bull;
  <a href="#configuration">Config</a>
</p>

---

## Why Enterprise Agent Memory?

Every coding agent forgets everything when the session ends. You waste the first 5 minutes re-explaining your stack. **Enterprise Agent Memory fixes this** — it silently captures what your agent does, compresses it into searchable memory, builds a knowledge graph, and injects the right context when the next session starts.

```
Session 1: "Add JWT auth to the API"
  Agent writes code, runs tests, fixes bugs
  → agentmemory captures every tool call silently
  → Observations compressed into structured memory via GPT-4o
  → Knowledge graph auto-extracted (entities, relationships)
  → Vectors embedded with text-embedding-3-large (3072 dims)
  → Everything stored in Cosmos DB + indexed in AI Search

Session 2: "Now add rate limiting"
  Agent already knows:
    ✓ Auth uses jose middleware in src/middleware/auth.ts
    ✓ Tests in test/auth.test.ts cover token validation
    ✓ You chose jose over jsonwebtoken for Edge compatibility
  → Zero re-explaining. Starts working immediately.
```

**What makes this different from the original agentmemory?** This is the Azure enterprise edition — same memory pipeline, but running on managed Azure services with multi-tenant isolation, auto-scaling, and one-click deployment. No SQLite files, no local iii-engine runtime, no single-process limitations.

---

## Architecture

```
                         ┌─────────────────────────────┐
                         │    AI Coding Agents          │
                         │  Claude Code · Cursor · Codex│
                         │  Gemini CLI · Any MCP client │
                         └─────────────┬───────────────┘
                                       │ REST API / MCP
                                       ▼
                    ┌──────────────────────────────────────┐
                    │       Azure Container Apps           │
                    │   Fastify v5 · Entra ID JWT Auth     │
                    │   Multi-tenant · Rate Limited        │
                    │   Auto-scales 1 → 10 replicas        │
                    └────┬──────┬──────┬──────┬───────────┘
                         │      │      │      │
              ┌──────────┘      │      │      └──────────┐
              ▼                 ▼      ▼                  ▼
     ┌─────────────┐  ┌──────────┐  ┌─────────────┐  ┌─────────────┐
     │  Cosmos DB   │  │Azure AI  │  │Azure OpenAI │  │Blob Storage │
     │  (Serverless)│  │ Search   │  │  (GPT-4o +  │  │  (Archive)  │
     │             │  │(BM25 +   │  │  embedding)  │  │             │
     │ Sessions    │  │ Vector)  │  │             │  │ Raw obs     │
     │ Observations│  │          │  │ Compress    │  │ Audit trail │
     │ Memories    │  │ 3072-dim │  │ Embed       │  │             │
     │ Graph nodes │  │ vectors  │  │ Graph extract│  │             │
     │ Graph edges │  │          │  │             │  │             │
     │ Audit log   │  │          │  │             │  │             │
     └─────────────┘  └──────────┘  └─────────────┘  └─────────────┘
              │
              └──────────────────┐
                                 ▼
                        ┌─────────────────┐
                        │  App Insights    │
                        │  (Monitoring)    │
                        └─────────────────┘
```

### Memory Pipeline

```
Agent tool call fires
  → Archive raw observation to Blob Storage
  → LLM compress via GPT-4o → structured facts + concepts + narrative
  → Generate vector embedding (text-embedding-3-large, 3072 dimensions)
  → Store compressed observation in Cosmos DB
  → Index in Azure AI Search (BM25 + vector)
  → Extract knowledge graph entities (fire-and-forget)
  → Increment session observation count + audit entry
```

---

<h2 id="works-with-every-agent">Works with Every Agent</h2>

Enterprise Agent Memory exposes a standard REST API that any agent can call. It also works with the original agentmemory MCP server and plugins.

<table>
<tr>
<td align="center" width="14%">
<a href="https://claude.com/product/claude-code"><img src="https://matthiasroder.com/content/images/2026/01/Claude.png?size=120" alt="Claude Code" width="48" height="48" /></a><br/>
<strong>Claude Code</strong><br/>
<sub>hooks + MCP</sub>
</td>
<td align="center" width="14%">
<a href="https://github.com/openai/codex"><img src="https://github.com/openai.png?size=120" alt="Codex CLI" width="48" height="48" /></a><br/>
<strong>Codex CLI</strong><br/>
<sub>hooks + MCP</sub>
</td>
<td align="center" width="14%">
<a href="https://cursor.com"><img src="https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png" alt="Cursor" width="48" height="48" /></a><br/>
<strong>Cursor</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="14%">
<a href="https://github.com/google-gemini/gemini-cli"><img src="https://github.com/google-gemini.png?size=120" alt="Gemini CLI" width="48" height="48" /></a><br/>
<strong>Gemini CLI</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="14%">
<a href="https://windsurf.com"><img src="https://exafunction.github.io/public/brand/windsurf-black-symbol.svg?size=120" alt="Windsurf" width="48" height="48" /></a><br/>
<strong>Windsurf</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="14%">
<a href="https://github.com/cline/cline"><img src="https://github.com/cline.png?size=120" alt="Cline" width="48" height="48" /></a><br/>
<strong>Cline</strong><br/>
<sub>MCP server</sub>
</td>
<td align="center" width="14%">
<a href="https://github.com/Aider-AI/aider"><img src="https://github.com/Aider-AI.png?size=120" alt="Aider" width="48" height="48" /></a><br/>
<strong>Aider</strong><br/>
<sub>REST API</sub>
</td>
</tr>
</table>

<p align="center">
  <sub>Works with <strong>any</strong> agent that speaks MCP or HTTP — one API, memories shared across all of them.</sub>
</p>

---

<h2 id="install">Install</h2>

### Prerequisites

- **Node.js** 18+ and npm
- **Azure subscription** with the following services provisioned (or use [Deploy to Azure](#deploy-to-azure)):
  - Azure Cosmos DB (NoSQL, serverless)
  - Azure AI Search (Basic or Standard)
  - Azure OpenAI (GPT-4o + text-embedding-3-large)
  - Azure Blob Storage

### Quick Start

```bash
# Clone
git clone https://github.com/msftse/enterprise-agent-memory.git
cd enterprise-agent-memory

# Install dependencies
npm install

# Configure (see Configuration section below)
cp .env.azure.example .env
# Edit .env with your Azure resource endpoints and keys

# Run in development mode
npm run dev

# Run tests (102 passing)
npm test

# Build for production
npm run build && npm start
```

The server starts on `http://localhost:8080`. Open `http://localhost:8080/viewer` for the built-in dashboard.

---

<h2 id="deploy-to-azure">Deploy to Azure</h2>

### One-Click Deploy

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fmsftse%2Fenterprise-agent-memory%2Fmain%2Finfra%2Fmain.bicep)

This deploys all required Azure services using our Bicep templates:

| Resource | What it creates |
|----------|----------------|
| Cosmos DB | Serverless NoSQL account + `agentmemory` database with 6 containers |
| AI Search | Basic tier search service with vector index (3072 dims) |
| Azure OpenAI | GPT-4o + text-embedding-3-large deployments (optional, requires quota) |
| Blob Storage | LRS storage account for raw observation archive |
| Container Apps | Consumption-plan app with auto-scale (1–10 replicas) |
| App Insights | Application monitoring and telemetry |
| Container Registry | ACR for Docker image hosting |

### Manual Deploy (CLI)

```bash
# 1. Create resource group
az group create --name rg-agentmemory --location westus2

# 2. Deploy infrastructure (Bicep)
az deployment group create \
  --resource-group rg-agentmemory \
  --template-file infra/main.bicep \
  --parameters baseName=agentmem environment=dev

# 3. Build & push Docker image to ACR
az acr build \
  --registry <your-acr-name> \
  --image agent-memory:latest \
  --file Dockerfile .

# 4. Update Container App with new image
az containerapp update \
  --name app-<baseName>-dev \
  --resource-group rg-agentmemory \
  --image <acr>.azurecr.io/agent-memory:latest
```

### Infrastructure Modules

The `infra/` directory contains 8 Bicep modules for full Azure deployment:

```
infra/
├── main.bicep                 # Orchestrator — wires all modules together
└── modules/
    ├── cosmos.bicep            # Cosmos DB NoSQL (serverless)
    ├── ai-search.bicep         # Azure AI Search
    ├── openai.bicep            # Azure OpenAI (conditional)
    ├── storage.bicep           # Blob Storage
    ├── container-app.bicep     # Container Apps + Environment
    ├── monitoring.bicep        # App Insights + Log Analytics
    └── networking.bicep        # VNet + private endpoints (optional)
```

---

<h2 id="how-it-works">How It Works</h2>

### Memory Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVATION PIPELINE                          │
│                                                                 │
│  Raw Input ──→ Blob Archive ──→ LLM Compress ──→ Embed (3072d) │
│                                      │                          │
│                                      ▼                          │
│                              ┌───────────────┐                  │
│                              │ Compressed Obs │                  │
│                              │  • title       │                  │
│                              │  • content     │                  │
│                              │  • facts[]     │                  │
│                              │  • concepts[]  │                  │
│                              │  • importance  │                  │
│                              └───────┬───────┘                  │
│                                      │                          │
│                     ┌────────────────┼────────────────┐         │
│                     ▼                ▼                ▼         │
│              Cosmos DB          AI Search       Graph Extract   │
│              (store)         (vector index)    (fire & forget)  │
└─────────────────────────────────────────────────────────────────┘
```

### Knowledge Graph

Entities and relationships are automatically extracted from every observation:

- **Nodes**: Files, concepts, libraries, functions, people, errors, patterns, projects, decisions
- **Edges**: imports, uses, depends_on, related_to, caused_by, solves, implements, tested_by
- **Deduplication**: Nodes matched by `name + type + tenantId`; edges by `source + target + type + tenantId`
- **Weight**: Edges start at 1.0, increment by 0.5 on re-observation (capped at 10)

### Multi-Tenant Isolation

Every record is scoped by `tenantId`. Every query filters by it. Tenant A never sees Tenant B's data.

```
Tenant A                         Tenant B
├── Sessions (scoped)            ├── Sessions (scoped)
├── Observations                 ├── Observations
├── Memories                     ├── Memories
├── Knowledge Graph              ├── Knowledge Graph
└── Search Index (filtered)      └── Search Index (filtered)
```

Authentication uses **Microsoft Entra ID** JWT tokens. The `x-tenant-id` header provides tenant scoping. For development, set `AUTH_DISABLED=true`.

---

<h2 id="real-time-dashboard">Real-Time Dashboard</h2>

A built-in web viewer is served at `/viewer` (root `/` redirects there). No separate process, no extra dependencies — it's a self-contained SPA served directly from the Fastify API.

**Features:**

| View | What it shows |
|------|--------------|
| 📊 **Dashboard** | Stats overview — sessions, observations, memories, graph node counts |
| 💚 **Health** | Real-time status of all Azure services (Cosmos, AI Search, Blob) |
| 📁 **Sessions** | Browse sessions with drill-down detail (project, model, tags, obs count) |
| 👁 **Observations** | Browse by session — view compressed content, facts, concepts, importance |
| 💡 **Memories** | List memories with strength bars, versioning, concept tags |
| 🔍 **Search** | Semantic search across all observations and memories |
| 🕸️ **Knowledge Graph** | Interactive force-directed graph visualization with click-to-inspect |

The viewer supports **dark/light theme toggle** and auto-detects system preference. The API URL and tenant ID are configurable in the top bar.

---

<h2 id="vs-the-original">vs Original agentmemory</h2>

This project takes the core concepts from [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory) and re-engineers them for Azure enterprise deployment.

<table>
<tr>
<th width="25%"></th>
<th width="37%">agentmemory (original)</th>
<th width="38%">Enterprise Agent Memory (Azure)</th>
</tr>
<tr>
<td><strong>Storage</strong></td>
<td>SQLite on local disk</td>
<td>Azure Cosmos DB (serverless, globally distributed)</td>
</tr>
<tr>
<td><strong>Vector Search</strong></td>
<td>BM25 + local embeddings (MiniLM)</td>
<td>Azure AI Search (BM25 + vector, 3072-dim text-embedding-3-large)</td>
</tr>
<tr>
<td><strong>LLM</strong></td>
<td>Any OpenAI-compatible provider</td>
<td>Azure OpenAI (GPT-4o for compression + graph extraction)</td>
</tr>
<tr>
<td><strong>Multi-tenancy</strong></td>
<td>Single user</td>
<td>Full tenant isolation (Entra ID + tenantId scoping)</td>
</tr>
<tr>
<td><strong>Scaling</strong></td>
<td>Single process</td>
<td>Container Apps auto-scale (1–10 replicas)</td>
</tr>
<tr>
<td><strong>Runtime</strong></td>
<td>iii-engine (Rust binary required)</td>
<td>Pure Node.js — no external runtime needed</td>
</tr>
<tr>
<td><strong>Knowledge Graph</strong></td>
<td>Optional (iii-engine)</td>
<td>Auto-extraction on every observation (fire-and-forget)</td>
</tr>
<tr>
<td><strong>Auth</strong></td>
<td>HMAC secret</td>
<td>Microsoft Entra ID JWT + RBAC</td>
</tr>
<tr>
<td><strong>Deployment</strong></td>
<td>npm install / Docker Compose</td>
<td>One-click Azure deploy (Bicep IaC)</td>
</tr>
<tr>
<td><strong>Compliance</strong></td>
<td>—</td>
<td>GDPR purge endpoint, audit trail in Blob Storage</td>
</tr>
<tr>
<td><strong>Viewer</strong></td>
<td>Port 3113 (separate process)</td>
<td>Built-in at /viewer (same server, no proxy)</td>
</tr>
<tr>
<td><strong>Tests</strong></td>
<td>950+</td>
<td>102 (unit + integration, vitest)</td>
</tr>
</table>

---

<h2 id="api-reference">API Reference</h2>

Base URL: `https://your-app.azurecontainerapps.io/api/v1`

All endpoints (except `/health`) require:
- **Authorization**: Bearer token (Entra ID JWT) — or set `AUTH_DISABLED=true` for development
- **x-tenant-id**: Tenant identifier header

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions` | Create a new agent session |
| `GET` | `/sessions` | List sessions (paginated) |
| `GET` | `/sessions/:id` | Get session by ID |
| `PATCH` | `/sessions/:id` | Update session metadata |
| `POST` | `/sessions/:id/end` | End session (set status to completed) |

### Observations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/observations` | Capture observation → compress → embed → store → index → graph |
| `GET` | `/observations/:id` | Get observation by ID |
| `GET` | `/sessions/:id/observations` | List observations for a session |

### Memories

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/memories` | Create a memory (with embedding) |
| `GET` | `/memories` | List memories (paginated) |
| `GET` | `/memories/:id` | Get memory by ID |
| `PUT` | `/memories/:id/evolve` | Evolve memory (creates new version) |
| `DELETE` | `/memories/:id` | Forget memory (soft delete, sets strength to 0) |

### Search

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/search` | Hybrid search — BM25 + vector + semantic reranking |

```bash
curl -X POST https://your-app.azurecontainerapps.io/api/v1/search \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: my-team" \
  -d '{"query": "how does authentication work", "limit": 5}'
```

### Knowledge Graph

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/graph/nodes` | List graph nodes (filter by type) |
| `GET` | `/graph/edges` | List graph edges (filter by nodeId) |
| `POST` | `/graph/nodes` | Create node |
| `POST` | `/graph/edges` | Create edge |
| `POST` | `/graph/traverse` | BFS traversal from a start node |
| `POST` | `/graph/extract` | Extract entities from a single observation |
| `POST` | `/graph/extract-batch` | Extract entities from all observations in a session |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — all Azure service statuses (no auth) |
| `GET` | `/admin/metrics` | Per-tenant usage metrics |
| `DELETE` | `/admin/tenant/:id` | GDPR purge — delete all data for a tenant |

---

<h2 id="azure-services">Azure Services</h2>

| Service | Purpose | SKU | Scaling |
|---------|---------|-----|---------|
| **Cosmos DB** | Sessions, observations, memories, graph nodes/edges, audit | Serverless | Auto-scales RU/s per request |
| **Azure AI Search** | Hybrid search (BM25 + 3072-dim vector) | Basic → Standard | Add replicas for throughput, partitions for index size |
| **Azure OpenAI** | GPT-4o (compression, graph extraction) + text-embedding-3-large | Standard | TPM-based rate limiting |
| **Blob Storage** | Raw observation archive + audit trail | LRS | Unlimited |
| **Container Apps** | Stateless API runtime | Consumption | 0.5 vCPU / 1GB → auto-scales to 10 replicas |
| **App Insights** | Distributed tracing + monitoring | — | — |

### Cost Estimate

| Tier | Users | Monthly Cost (est.) |
|------|-------|---------------------|
| **Dev** | 1–5 | ~$15–30 (serverless Cosmos + basic Search) |
| **Team** | 5–50 | ~$80–150 (basic Search + moderate Cosmos RU) |
| **Enterprise** | 50+ | ~$300+ (standard Search + provisioned Cosmos) |

---

<h2 id="configuration">Configuration</h2>

### Environment Variables

```bash
# Required — Azure service endpoints
COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/
AI_SEARCH_ENDPOINT=https://your-search.search.windows.net
STORAGE_ACCOUNT_URL=https://yourstorage.blob.core.windows.net

# Optional — Azure OpenAI (LLM features disabled without this)
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com
AZURE_OPENAI_API_KEY=your-key          # or use Managed Identity

# Optional — key-based auth for local development
COSMOS_KEY=your-cosmos-account-key
STORAGE_ACCOUNT_KEY=your-storage-key
AI_SEARCH_ADMIN_KEY=your-search-admin-key

# Server
PORT=8080                              # default: 8080
LOG_LEVEL=info                         # debug | info | warn | error
AUTH_DISABLED=true                     # skip Entra ID auth (dev only)
```

In production, the app uses **Managed Identity (DefaultAzureCredential)** — no keys needed. Set `COSMOS_KEY` / `STORAGE_ACCOUNT_KEY` only for local development where RBAC isn't configured.

---

## Project Structure

```
├── src/
│   ├── types/              # 60+ domain model interfaces (tenantId multi-tenancy)
│   │   ├── models.ts       # Session, CompressedObservation, Memory, GraphNode, GraphEdge
│   │   └── api.ts          # Request/response types
│   ├── config/             # Zod-validated Azure config with graceful degradation
│   ├── adapters/           # Azure service adapters
│   │   ├── cosmos.adapter.ts          # Cosmos DB (key + DefaultAzureCredential)
│   │   ├── ai-search.adapter.ts       # AI Search (vector + BM25)
│   │   ├── azure-openai.adapter.ts    # OpenAI (compress, embed, graph extract)
│   │   ├── blob-storage.adapter.ts    # Blob Storage (archive, audit)
│   │   └── fabric/lakehouse.adapter.ts # Fabric Lakehouse (analytics)
│   ├── engine/             # Core memory pipeline
│   │   ├── observe.ts      # 7-step pipeline: archive → compress → embed → store → index → graph → audit
│   │   ├── compress.ts     # GPT-4o observation compression
│   │   ├── remember.ts     # Memory creation + versioning
│   │   ├── forget.ts       # Soft deletion (set strength to 0)
│   │   ├── search.ts       # Hybrid search orchestration
│   │   └── graph.ts        # Knowledge graph CRUD + entity extraction + deduplication
│   ├── middleware/          # Auth (Entra ID JWT), tenant isolation, rate limiting
│   ├── routes/             # 20+ Fastify route handlers
│   │   ├── sessions.routes.ts
│   │   ├── observations.routes.ts
│   │   ├── memories.routes.ts
│   │   ├── search.routes.ts
│   │   ├── graph.routes.ts
│   │   ├── admin.routes.ts
│   │   └── viewer.routes.ts    # Serves built-in dashboard
│   ├── viewer/
│   │   └── index.html          # Self-contained SPA dashboard
│   └── index.ts                # Fastify server entrypoint
├── infra/                      # 8 Bicep modules for Azure deployment
│   ├── main.bicep
│   └── modules/
├── src/__tests__/              # 102 tests (vitest)
│   ├── unit/                   # 9 unit test suites
│   └── integration/            # API integration tests
├── docs/
│   ├── PRD.md                  # Product requirements document
│   └── architecture.excalidraw
├── Dockerfile                  # Multi-stage Node 22 Alpine build
├── vitest.config.ts
└── package.json
```

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test` — all 102 should pass)
4. Commit your changes
5. Push to the branch and open a Pull Request

---

## License

This project is licensed under the **Apache License 2.0** — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **[agentmemory](https://github.com/rohitg00/agentmemory)** by [Rohit Ghumare](https://github.com/rohitg00) — the original persistent memory system for AI coding agents that inspired this enterprise edition.
- **[iii engine](https://github.com/iii-hq/iii)** — the runtime that powers the original agentmemory.
- Built with [Azure Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/), [Azure AI Search](https://learn.microsoft.com/azure/search/), [Azure OpenAI](https://learn.microsoft.com/azure/ai-services/openai/), and [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/).

---

<p align="center">
  <sub>Built with ❤️ by the Microsoft SE team · Powered by Azure</sub>
</p>
