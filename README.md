# 🧠 Enterprise Agent Memory for Azure

Enterprise-grade, multi-tenant agent memory platform built on Azure — transforms the open-source [agentmemory](https://github.com/rohitg00/agentmemory) single-process runtime into a distributed, scalable, compliant memory infrastructure.

## Architecture

```
Clients / Agents
       ↓
  API Management (Fastify v5)
       ↓
  ┌──────────────┬───────────────┬───────────────┐
  │  Cosmos DB   │  AI Search    │  Azure OpenAI  │
  │  (state)     │  (hybrid      │  (embeddings + │
  │              │   search)     │   compression) │
  └──────────────┴───────────────┴───────────────┘
       ↓                                ↓
  Blob Storage                   Fabric Lakehouse
  (audit trail)                  (analytics)
```

## What's Inside

| Layer | Implementation |
|-------|---------------|
| **Types** | 60+ interfaces with `tenantId` multi-tenancy |
| **Config** | Zod-validated Azure config with graceful degradation |
| **Adapters** | Cosmos DB, AI Search (hybrid BM25+vector), Azure OpenAI, Blob Storage, Fabric Lakehouse |
| **Engine** | Observe → Compress → Embed → Store → Index pipeline |
| **Middleware** | Entra ID JWT auth, tenant isolation, per-tenant rate limiting |
| **Routes** | Sessions, Observations, Memories, Search, Graph, Admin (20+ endpoints) |
| **Infra** | 8 Bicep modules for full Azure deployment |
| **Tests** | 92 unit + integration tests (vitest) |
| **Docker** | Multi-stage Node 22 Alpine build |

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.azure.example .env
# Edit .env with your Azure resource endpoints

# Dev
npm run dev

# Test
npm test

# Build
npm run build

# Start production
npm start
```

## Deploy to Azure

```bash
# 1. Deploy infrastructure
az deployment group create \
  --resource-group rg-agentmemory \
  --template-file infra/main.bicep \
  --parameters env=dev

# 2. Build & push Docker image
az acr build --registry <your-acr> \
  --image agent-memory:v0.1.0 \
  --file Dockerfile .

# 3. Update Container App
az containerapp update \
  --name <app-name> \
  --resource-group <rg> \
  --image <acr>.azurecr.io/agent-memory:v0.1.0
```

## API Endpoints

### Sessions
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/sessions` | Create session |
| `GET` | `/api/v1/sessions/:id` | Get session |
| `PATCH` | `/api/v1/sessions/:id` | Update session |
| `POST` | `/api/v1/sessions/:id/end` | End session |

### Observations
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/observations` | Capture observation (compress → embed → store → index) |
| `GET` | `/api/v1/observations/:id` | Get observation |
| `GET` | `/api/v1/sessions/:id/observations` | List by session |

### Memories
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/memories` | Create memory |
| `GET` | `/api/v1/memories/:id` | Get memory |
| `PUT` | `/api/v1/memories/:id/evolve` | Evolve (version) memory |
| `DELETE` | `/api/v1/memories/:id` | Forget (soft delete) |

### Search
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/search` | Hybrid search (BM25 + vector + semantic) |

### Knowledge Graph
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/graph/nodes` | Create node |
| `POST` | `/api/v1/graph/edges` | Create edge |
| `POST` | `/api/v1/graph/traverse` | BFS traversal |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check (no auth) |
| `GET` | `/api/v1/admin/metrics` | Tenant metrics |
| `DELETE` | `/api/v1/admin/tenant/:id` | GDPR purge |

## Azure Services

| Service | Purpose | SKU |
|---------|---------|-----|
| **Cosmos DB** | Sessions, observations, memories, graph | Serverless |
| **AI Search** | Hybrid search (BM25 + 3072-dim vectors) | Basic |
| **Azure OpenAI** | GPT-4o compression + text-embedding-3-large | Standard |
| **Blob Storage** | Audit trail + raw observation archive | LRS |
| **Container Apps** | Stateless API runtime | Consumption |
| **App Insights** | Telemetry + monitoring | — |
| **Fabric Lakehouse** | Analytics (optional) | — |

## Environment Variables

See [`.env.azure.example`](.env.azure.example) for full list.

Key variables:
```bash
COSMOS_ENDPOINT=https://your-cosmos.documents.azure.com:443/
AI_SEARCH_ENDPOINT=https://your-search.search.windows.net
STORAGE_ACCOUNT_URL=https://yourstorage.blob.core.windows.net
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com  # optional
AUTH_DISABLED=true  # for development
```

## E2E Test Results

| # | Operation | Status |
|---|-----------|--------|
| 1 | Health Check | ✅ |
| 2 | Create Session | ✅ |
| 3 | Capture Observation (compress + embed) | ✅ |
| 4 | Create Memory | ✅ |
| 5 | Evolve Memory (versioning) | ✅ |
| 6 | Hybrid Search | ✅ |
| 7 | Graph Nodes + Edges | ✅ |
| 8 | List Observations | ✅ |
| 9 | Forget Memory (soft delete) | ✅ |
| 10 | End Session | ✅ |
| 11 | Admin Metrics | ✅ |

## Mapping from agentmemory

| agentmemory concept | Azure equivalent |
|---------------------|-------------------|
| KV store | Cosmos DB |
| Vector index | Azure AI Search |
| Graph | Cosmos adjacency lists |
| Hooks | Event-driven pipeline |
| Single runtime | Container Apps |
| Local disk | Blob Storage |
| — | Fabric Lakehouse (analytics) |

## Project Structure

```
├── src/
│   ├── types/          # Domain models + API types
│   ├── config/         # Zod-validated Azure config
│   ├── adapters/       # Azure service adapters
│   │   ├── cosmos.adapter.ts
│   │   ├── ai-search.adapter.ts
│   │   ├── azure-openai.adapter.ts
│   │   ├── blob-storage.adapter.ts
│   │   └── fabric/lakehouse.adapter.ts
│   ├── engine/         # Core memory pipeline
│   │   ├── observe.ts  # Capture → compress → embed → store
│   │   ├── compress.ts # LLM observation compression
│   │   ├── remember.ts # Memory creation + versioning
│   │   ├── forget.ts   # Soft deletion
│   │   ├── search.ts   # Hybrid search orchestration
│   │   └── graph.ts    # Knowledge graph operations
│   ├── middleware/      # Auth, tenant isolation, rate limiting
│   ├── routes/         # Fastify route handlers
│   └── index.ts        # Server entrypoint
├── infra/              # 8 Bicep modules
├── docs/
│   ├── PRD.md          # Full product requirements
│   └── architecture.excalidraw
├── Dockerfile
└── vitest.config.ts
```

## License

Apache-2.0

## Credits

Based on the architecture of [agentmemory](https://github.com/rohitg00/agentmemory) by Rohit Ghumare, re-engineered for Azure enterprise use.
