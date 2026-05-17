# Enterprise Agent Memory — Azure Platform PRD

> Product Requirements Document for transforming [agentmemory](https://github.com/rohitg00/agentmemory) (v0.9.17) into an enterprise-grade, multi-tenant Azure memory platform for AI agents.

---

## 1. Executive Summary

Enterprise Agent Memory is an Azure-native platform that provides **persistent, scalable memory infrastructure for AI coding agents**. It is a fork-and-transform of the open-source `agentmemory` project — which proves the pattern of session-scoped observations, LLM-compressed memories, hybrid search, and knowledge graphs — into a production-grade distributed system.

The original agentmemory collapses storage, compute, search, and indexing into a single-process runtime backed by an embedded engine (`iii-engine`). This works for individual developers but cannot serve enterprise customers who need multi-tenancy, compliance, horizontal scaling, and SLA-backed reliability.

**Our value proposition:** We decouple these layers into Azure-managed services — Cosmos DB for state, Azure AI Search for retrieval, Event Hubs for ingestion, Azure OpenAI for intelligence — delivering enterprise-grade agent memory infrastructure that scales from 10 to 10,000+ agents per tenant.

**MVP goal:** A working multi-tenant agent memory API deployed on Azure Container Apps, with Cosmos DB persistence, Azure AI Search hybrid retrieval, Azure OpenAI embeddings/compression, Entra ID authentication, and a clean REST API — ready for internal Microsoft SE demos and early customer pilots.

---

## 2. Mission

**Mission Statement:** Enable enterprise AI agents to remember, learn, and reason across sessions — with the security, compliance, and scale that enterprise customers demand.

**Core Principles:**

1. **Memory is Infrastructure** — Agent memory is not a feature; it's a platform layer. Treat it like a database, not a plugin.
2. **Tenant Isolation is Non-Negotiable** — Every byte of data is scoped to a tenant. No cross-contamination, ever.
3. **Azure-Native, Not Azure-Wrapped** — Use managed services properly (Cosmos DB partitioning, AI Search semantic ranking, managed identity), not just as dumb storage.
4. **Preserve the Core Model** — agentmemory's data model (Session → Observation → Memory → Graph) is battle-tested. Transform the infrastructure, not the concepts.
5. **Progressive Complexity** — Start with a simple deployment that works for 10 users. Architecture supports scaling to millions without re-architecture.

---

## 3. Target Users

### Primary: Microsoft Solutions Engineers (SEs)

- **Who:** Field SEs running customer architecture sessions and demos
- **Technical Level:** High — comfortable with Azure services, IaC, APIs
- **Need:** A reference implementation to show customers how agent memory works at enterprise scale
- **Pain Point:** No Azure-native agent memory solution to demo; current options are single-process dev tools

### Secondary: Enterprise Development Teams

- **Who:** Teams building AI agent systems (Copilot extensions, custom agents, LangChain/LangGraph apps)
- **Technical Level:** High — building production systems
- **Need:** Drop-in memory layer they can integrate via REST API
- **Pain Point:** Every team reinvents agent memory; no standard, scalable solution exists

### Tertiary: ISVs Building Agent Platforms

- **Who:** Software vendors adding AI agents to their products
- **Technical Level:** Medium-High
- **Need:** Multi-tenant memory-as-a-service they can embed
- **Pain Point:** Building memory infrastructure from scratch is expensive and error-prone

---

## 4. MVP Scope

### ✅ In Scope — Core Functionality

- ✅ Session lifecycle management (create, update, end, list, get)
- ✅ Observation capture and LLM-powered compression
- ✅ Memory CRUD (create, read, evolve, forget) with versioning
- ✅ Hybrid search (BM25 + vector) via Azure AI Search
- ✅ Knowledge graph (nodes + edges) with traversal queries
- ✅ Azure OpenAI integration (GPT-4o compression, text-embedding-3-large)
- ✅ Multi-tenant data isolation (tenantId partition key)
- ✅ REST API with Entra ID JWT authentication
- ✅ RBAC (admin / agent / reader roles)
- ✅ Cosmos DB persistence for all state
- ✅ Blob Storage for audit trail and raw observation archive
- ✅ Container Apps deployment with auto-scaling
- ✅ Bicep IaC for one-click Azure deployment
- ✅ Health checks and basic monitoring

### ✅ In Scope — Technical

- ✅ TypeScript/Node.js (preserve original language)
- ✅ ESM modules
- ✅ Managed Identity for all Azure service auth
- ✅ Docker multi-stage build
- ✅ GitHub Actions CI/CD
- ✅ Environment-based configuration

### ❌ Out of Scope — Deferred to Post-MVP

- ❌ Event Hubs async pipeline (use synchronous processing in MVP)
- ❌ Azure Functions for background processing (run in-process in MVP)
- ❌ API Management (use in-app middleware for rate limiting in MVP)
- ❌ Multi-region replication
- ❌ Redis hot-tier caching
- ❌ Data Lake cold storage
- ❌ Azure Purview integration
- ❌ Cross-agent federation / shared memory
- ❌ MCP server mode (preserve but don't prioritize)
- ❌ CLI interface (API-first for MVP)
- ❌ Web viewer UI
- ❌ Memory consolidation (periodic LLM-based summarization)
- ❌ Procedural memory and routines
- ❌ Actions, signals, checkpoints, sentinels (agentic workflow primitives)
- ❌ Team/collaborative memory features
- ❌ Snapshot/versioning (git-style memory versioning)

---

## 5. User Stories

### US-1: Agent Session Memory

> As an **AI agent**, I want to **persist observations from my current session**, so that **I can recall what I've done and learned when I need context**.

**Example:** Claude Code runs a debugging session. Each tool call (file reads, command runs, errors) is captured as an observation. When the agent needs context mid-session, it searches its own session observations.

### US-2: Cross-Session Recall

> As an **AI agent**, I want to **search memories from past sessions**, so that **I don't repeat mistakes or rediscover things I already know**.

**Example:** An agent starts a new session on the same codebase. It queries "how did we handle auth?" and gets back compressed memories from 3 previous sessions, including patterns discovered and bugs fixed.

### US-3: Tenant-Scoped Isolation

> As an **enterprise admin**, I want to **ensure my organization's agent memory is completely isolated from other tenants**, so that **our proprietary code context never leaks**.

**Example:** Tenant A's agents cannot see, search, or access any data belonging to Tenant B. Partition keys in Cosmos DB enforce this at the storage layer.

### US-4: Knowledge Graph Queries

> As an **AI agent**, I want to **query a knowledge graph of entities and relationships extracted from my observations**, so that **I can reason about how components relate to each other**.

**Example:** Agent asks "what files depend on auth.ts?" and the graph returns nodes (files, functions, concepts) connected via edges (imports, modifies, depends_on).

### US-5: Secure API Access

> As a **platform developer**, I want to **authenticate via Entra ID and use RBAC to control access**, so that **only authorized agents and users can read/write memory**.

**Example:** An agent authenticates with a managed identity token. Its JWT contains `tenantId` and role claims. The API validates the token, extracts the tenant, and scopes all queries.

### US-6: One-Click Deployment

> As an **SE running a customer demo**, I want to **deploy the full stack to Azure with a single command**, so that **I can show a working enterprise memory system in minutes**.

**Example:** `az deployment group create -f infra/main.bicep` provisions Cosmos DB, AI Search, Container App, OpenAI, Blob Storage, and networking — ready to accept API calls.

### US-7: Audit Trail

> As a **compliance officer**, I want to **see an immutable audit log of every memory write, delete, and evolve operation**, so that **we can demonstrate data governance to auditors**.

**Example:** Every `POST /memories`, `DELETE /memories/:id`, and `PUT /memories/:id/evolve` writes an append-only audit entry to Blob Storage with timestamp, user, tenant, operation, and affected IDs.

### US-8: GDPR Data Purge

> As a **tenant admin**, I want to **delete all memory data for my tenant**, so that **we comply with GDPR right-to-erasure requirements**.

**Example:** `DELETE /api/v1/admin/tenant-data` purges all Cosmos DB documents, AI Search index entries, and Blob Storage objects for the authenticated tenant.

---

## 6. Core Architecture & Patterns

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│  AI Agents · Copilot Extensions · REST API Clients       │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTPS + JWT
┌──────────────────────▼───────────────────────────────────┐
│              COMPUTE LAYER (Stateless)                    │
│         Azure Container Apps (auto-scale)                 │
│                                                          │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐      │
│  │ Auth MW  │ │ Tenant MW│ │ Routes │ │ Rate Lim │      │
│  └─────────┘ └──────────┘ └────────┘ └──────────┘      │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │          Core Memory Engine                   │       │
│  │  Observe · Compress · Remember · Search       │       │
│  │  Graph Extract · Forget · Evolve              │       │
│  └──────────────────────────────────────────────┘       │
└────┬──────────────┬──────────────┬───────────────────────┘
     │              │              │
┌────▼────┐  ┌──────▼──────┐  ┌───▼────────────┐
│Cosmos DB│  │Azure AI     │  │Azure OpenAI    │
│(State)  │  │Search       │  │(Embeddings +   │
│         │  │(Retrieval)  │  │ Compression)   │
└────┬────┘  └─────────────┘  └────────────────┘
     │
┌────▼──────────┐
│ Blob Storage  │
│ (Audit + Raw) │
└───────────────┘
```

### Directory Structure

```
enterprise-agent-memory/
├── src/
│   ├── index.ts                    # Service entrypoint (Express/Fastify)
│   ├── config/
│   │   └── azure.config.ts         # Azure service configuration
│   ├── adapters/
│   │   ├── cosmos.adapter.ts       # Cosmos DB state operations
│   │   ├── ai-search.adapter.ts    # Azure AI Search indexing + query
│   │   ├── azure-openai.adapter.ts # Embeddings + LLM compression
│   │   └── blob-storage.adapter.ts # Audit log + raw archive
│   ├── middleware/
│   │   ├── auth.middleware.ts       # Entra ID JWT validation
│   │   ├── tenant.middleware.ts     # Tenant extraction + scoping
│   │   └── rate-limit.middleware.ts # Per-tenant rate limiting
│   ├── routes/
│   │   ├── sessions.routes.ts      # Session CRUD
│   │   ├── observations.routes.ts  # Observation capture + query
│   │   ├── memories.routes.ts      # Memory CRUD + evolve
│   │   ├── search.routes.ts        # Hybrid search + recall
│   │   ├── graph.routes.ts         # Graph nodes/edges + traversal
│   │   └── admin.routes.ts         # Health, audit, tenant management
│   ├── engine/
│   │   ├── observe.ts              # Observation capture + compression
│   │   ├── compress.ts             # LLM compression logic
│   │   ├── remember.ts             # Memory creation + versioning
│   │   ├── forget.ts               # Memory deletion
│   │   ├── evolve.ts               # Memory evolution (update)
│   │   ├── search.ts               # Search orchestration
│   │   └── graph.ts                # Graph extraction + queries
│   ├── types/
│   │   ├── models.ts               # Core data models (Session, Observation, Memory, etc.)
│   │   ├── api.ts                  # Request/response types
│   │   └── azure.ts                # Azure-specific types
│   └── telemetry/
│       └── monitor.ts              # OpenTelemetry → Azure Monitor
├── infra/
│   ├── main.bicep                  # Orchestrator template
│   └── modules/
│       ├── cosmos.bicep
│       ├── ai-search.bicep
│       ├── openai.bicep
│       ├── container-app.bicep
│       ├── storage.bicep
│       ├── monitoring.bicep
│       └── networking.bicep
├── test/
│   ├── unit/
│   └── integration/
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.azure.example
└── README.md
```

### Key Design Patterns

- **Adapter Pattern:** All Azure services accessed through adapter interfaces. Enables local testing with mocks and future provider swaps.
- **Tenant-Scoped Middleware:** Every request extracts `tenantId` from JWT. All downstream operations are scoped. No global queries possible.
- **Versioned Memories:** Memories are never mutated. `evolve()` creates a new version with `parentId` pointing to the previous. Full audit trail.
- **Hybrid Search Orchestration:** Search queries hit AI Search with both BM25 and vector simultaneously. Results are merged with configurable weights and optional graph boosting.

---

## 7. Feature Specifications

### 7.1 Session Management

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Create | POST | `/api/v1/sessions` | Start a new agent session |
| Get | GET | `/api/v1/sessions/:id` | Get session details |
| List | GET | `/api/v1/sessions` | List sessions (paginated, filterable) |
| Update | PATCH | `/api/v1/sessions/:id` | Update session status/metadata |
| End | POST | `/api/v1/sessions/:id/end` | End session, trigger summary |

**Session Model:**

```typescript
interface Session {
  id: string;
  tenantId: string;
  project: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "completed" | "abandoned";
  observationCount: number;
  model?: string;
  tags?: string[];
  firstPrompt?: string;
  summary?: string;
}
```

### 7.2 Observation Capture

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Capture | POST | `/api/v1/observations` | Capture raw observation |
| Get | GET | `/api/v1/observations/:id` | Get compressed observation |
| List | GET | `/api/v1/sessions/:id/observations` | List session observations |
| Search | POST | `/api/v1/observations/search` | Search observations |

**Capture Flow:**

```
Raw observation (tool call, prompt, error, etc.)
  → Validate + extract metadata
  → LLM compression via Azure OpenAI (GPT-4o)
  → Generate embedding via Azure OpenAI (text-embedding-3-large)
  → Write to Cosmos DB (observations container)
  → Index in Azure AI Search
  → Write audit entry to Blob Storage
```

**Compressed Observation Model:**

```typescript
interface CompressedObservation {
  id: string;
  tenantId: string;
  sessionId: string;
  timestamp: string;
  type: ObservationType;  // file_read, file_write, command_run, error, etc.
  title: string;
  subtitle?: string;
  facts: string[];
  narrative: string;
  concepts: string[];
  files: string[];
  importance: number;     // 0-10
  confidence?: number;
  embedding?: number[];   // 3072-dim vector
}
```

### 7.3 Memory CRUD

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Create | POST | `/api/v1/memories` | Create a memory |
| Get | GET | `/api/v1/memories/:id` | Get memory by ID |
| List | GET | `/api/v1/memories` | List memories (filterable) |
| Evolve | PUT | `/api/v1/memories/:id/evolve` | Create new version |
| Forget | DELETE | `/api/v1/memories/:id` | Soft-delete memory |
| Search | POST | `/api/v1/memories/search` | Search memories |

**Memory Model:**

```typescript
interface Memory {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  type: "pattern" | "preference" | "architecture" | "bug" | "workflow" | "fact";
  title: string;
  content: string;
  concepts: string[];
  files: string[];
  sessionIds: string[];
  strength: number;
  version: number;
  parentId?: string;        // Previous version
  supersedes?: string[];
  sourceObservationIds?: string[];
  isLatest: boolean;
  embedding?: number[];
}
```

### 7.4 Hybrid Search

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Search | POST | `/api/v1/search` | Unified hybrid search |
| Recall | POST | `/api/v1/search/recall` | Context-optimized recall |

**Search Request:**

```typescript
interface SearchRequest {
  query: string;
  scope?: "observations" | "memories" | "all";
  sessionId?: string;       // Scope to session
  project?: string;         // Scope to project
  limit?: number;           // Default: 10
  bm25Weight?: number;      // Default: 0.4
  vectorWeight?: number;    // Default: 0.6
  graphBoost?: boolean;     // Default: false
  filters?: {
    type?: string[];
    dateFrom?: string;
    dateTo?: string;
    minImportance?: number;
  };
}
```

**Search Pipeline:**

```
Query string
  → Generate query embedding (Azure OpenAI)
  → Azure AI Search hybrid query (BM25 + vector)
  → Optional: graph context boosting
  → Rerank by combined score
  → Return top-K results with scores
```

### 7.5 Knowledge Graph

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Get Node | GET | `/api/v1/graph/nodes/:id` | Get node |
| List Nodes | GET | `/api/v1/graph/nodes` | List/filter nodes |
| Get Edge | GET | `/api/v1/graph/edges/:id` | Get edge |
| Traverse | POST | `/api/v1/graph/traverse` | Traverse from node |
| Search | POST | `/api/v1/graph/search` | Search graph |

**Graph Node Types:** `file`, `function`, `concept`, `error`, `decision`, `pattern`, `library`, `person`, `project`, `preference`

**Graph Edge Types:** `uses`, `imports`, `modifies`, `causes`, `fixes`, `depends_on`, `related_to`, `prefers`, `avoids`

### 7.6 Admin & Governance

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Health | GET | `/api/v1/health` | Service health check |
| Metrics | GET | `/api/v1/admin/metrics` | Usage metrics |
| Audit Log | GET | `/api/v1/admin/audit` | Query audit trail |
| Purge Tenant | DELETE | `/api/v1/admin/tenant-data` | GDPR full purge |
| Export | GET | `/api/v1/admin/export` | Export all tenant data |

---

## 8. Technology Stack

### Core Runtime

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22.x LTS | Runtime |
| TypeScript | 5.x | Type safety |
| Fastify | 5.x | HTTP framework (high perf, schema validation) |
| Zod | 4.x | Request/response validation |

### Azure Services

| Service | SKU (MVP) | Purpose |
|---------|-----------|---------|
| Azure Container Apps | Consumption | Stateless API compute |
| Azure Cosmos DB | Serverless | State persistence (sessions, observations, memories, graph) |
| Azure AI Search | Basic (1 replica) | Hybrid search (BM25 + vector) |
| Azure OpenAI | Standard | GPT-4o (compression) + text-embedding-3-large (embeddings) |
| Azure Blob Storage | Standard LRS | Audit trail + raw archive |
| Azure Monitor | — | Logging, metrics, tracing |
| Microsoft Entra ID | — | Authentication + RBAC |

### Azure SDKs

| Package | Purpose |
|---------|---------|
| `@azure/cosmos` | Cosmos DB operations |
| `@azure/search-documents` | AI Search indexing + queries |
| `@azure/openai` | Embeddings + chat completions |
| `@azure/storage-blob` | Blob Storage operations |
| `@azure/identity` | Managed identity + token auth |
| `@azure/monitor-opentelemetry` | Telemetry export |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `vitest` | Unit + integration testing |
| `tsup` | TypeScript build |
| `tsx` | Dev-time TS execution |
| `@biomejs/biome` | Linting + formatting |

---

## 9. Security & Configuration

### Authentication

- **Method:** Entra ID JWT Bearer tokens
- **Validation:** `@azure/identity` validates tokens against tenant's Entra ID
- **Token Claims:** `sub` (user/app ID), `tid` (tenant ID), `roles` (admin/agent/reader)
- **Service-to-Service:** Managed Identity for all Azure SDK calls (no connection strings)

### RBAC Roles

| Role | Sessions | Observations | Memories | Search | Graph | Admin |
|------|----------|-------------|----------|--------|-------|-------|
| **admin** | CRUD | CRUD | CRUD | ✅ | CRUD | ✅ |
| **agent** | CRUD | CRUD | CRUD | ✅ | CRUD | ❌ |
| **reader** | Read | Read | Read | ✅ | Read | ❌ |

### Configuration (Environment Variables)

```bash
# Azure Identity (or use Managed Identity — no env vars needed)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=

# Cosmos DB
COSMOS_ENDPOINT=https://<name>.documents.azure.com:443/
COSMOS_DATABASE=agentmemory

# Azure AI Search
AI_SEARCH_ENDPOINT=https://<name>.search.windows.net
AI_SEARCH_INDEX=agent-memory

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://<name>.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4o
AZURE_OPENAI_DEPLOYMENT_EMBEDDING=text-embedding-3-large

# Blob Storage
STORAGE_ACCOUNT_URL=https://<name>.blob.core.windows.net

# App
PORT=8080
NODE_ENV=production
LOG_LEVEL=info
RATE_LIMIT_PER_MINUTE=100
```

### Security Scope

- ✅ **In Scope:** JWT auth, RBAC, tenant isolation, managed identity, audit trail
- ✅ **In Scope:** VNet integration, private endpoints (in Bicep templates)
- ❌ **Out of Scope:** Customer-managed encryption keys (CMK)
- ❌ **Out of Scope:** Data residency / geo-fencing
- ❌ **Out of Scope:** PII detection/redaction in observations

---

## 10. API Specification

### Base URL

```
https://<container-app-name>.<region>.azurecontainerapps.io/api/v1
```

### Authentication

All requests require:

```
Authorization: Bearer <entra-id-jwt>
```

### Common Response Envelope

```json
{
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO-8601",
    "tenantId": "uuid"
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "MEMORY_NOT_FOUND",
    "message": "Memory with id 'abc' not found",
    "status": 404
  },
  "meta": { ... }
}
```

### Example: Capture Observation

```bash
POST /api/v1/observations
Content-Type: application/json
Authorization: Bearer <token>

{
  "sessionId": "sess_abc123",
  "hookType": "post_tool_use",
  "toolName": "Read",
  "toolInput": { "path": "src/auth.ts" },
  "toolOutput": "export function validateToken...",
  "timestamp": "2026-05-17T10:00:00Z"
}
```

Response:

```json
{
  "data": {
    "id": "obs_xyz789",
    "sessionId": "sess_abc123",
    "type": "file_read",
    "title": "Read auth.ts — token validation function",
    "facts": ["Auth module exports validateToken()", "Uses JWT verification"],
    "narrative": "Agent read the auth module to understand token validation logic.",
    "concepts": ["authentication", "JWT", "validation"],
    "files": ["src/auth.ts"],
    "importance": 6
  },
  "meta": { ... }
}
```

### Example: Hybrid Search

```bash
POST /api/v1/search
Content-Type: application/json
Authorization: Bearer <token>

{
  "query": "how did we handle authentication errors?",
  "scope": "all",
  "limit": 5,
  "bm25Weight": 0.4,
  "vectorWeight": 0.6
}
```

Response:

```json
{
  "data": {
    "results": [
      {
        "type": "memory",
        "id": "mem_001",
        "title": "Auth error handling pattern",
        "content": "Auth module requires defensive null checks...",
        "score": 0.89,
        "bm25Score": 0.72,
        "vectorScore": 0.95
      }
    ],
    "totalCount": 12,
    "searchDuration": 45
  }
}
```

---

## 11. Success Criteria

### MVP Success Definition

The MVP is successful when an SE can:

1. Deploy the full stack to Azure in < 15 minutes via Bicep
2. Authenticate an agent via Entra ID
3. Run a 20-observation session with compression and search
4. Demo hybrid search returning relevant memories
5. Show audit trail in Blob Storage
6. Tear down the environment cleanly

### Functional Requirements

- ✅ All 6 route groups operational (sessions, observations, memories, search, graph, admin)
- ✅ Observation capture with LLM compression completes in < 5 seconds
- ✅ Hybrid search returns results in < 500ms
- ✅ Tenant isolation verified — cross-tenant queries return zero results
- ✅ Auth rejects invalid/expired tokens with 401
- ✅ RBAC enforces role-based access correctly
- ✅ Audit log captures all write operations
- ✅ Health endpoint returns service status

### Quality Indicators

- Zero unhandled exceptions in production
- All Azure SDK calls use managed identity (no connection strings in code)
- API response times: p50 < 200ms, p99 < 2s
- Test coverage > 80% on engine/ and adapters/

---

## 12. Implementation Phases

### Phase 1: Foundation

**Goal:** Bootable service with Cosmos DB, health check, and auth middleware.

**Deliverables:**

- ✅ Project scaffold (package.json, tsconfig, Dockerfile, Bicep skeleton)
- ✅ Fastify server with `/health` endpoint
- ✅ Cosmos DB adapter — database + container initialization
- ✅ Entra ID auth middleware (JWT validation)
- ✅ Tenant extraction middleware
- ✅ Data model types (Session, Observation, Memory, GraphNode, GraphEdge)
- ✅ Basic Bicep template (Cosmos DB + Container App)
- ✅ CI pipeline (build + type-check)

**Validation:** `curl /api/v1/health` returns 200 on Container App.

### Phase 2: Core Memory Engine

**Goal:** Sessions, observations, and memories work end-to-end with Cosmos DB.

**Deliverables:**

- ✅ Session routes (CRUD + end)
- ✅ Observation capture route with Azure OpenAI compression
- ✅ Memory routes (CRUD + evolve + forget)
- ✅ Azure OpenAI adapter (chat completions + embeddings)
- ✅ Blob Storage adapter for audit trail
- ✅ Unit tests for all engine functions
- ✅ Integration tests for API routes

**Validation:** Full observation-to-memory pipeline works via API calls.

### Phase 3: Search & Graph

**Goal:** Hybrid search and knowledge graph operational.

**Deliverables:**

- ✅ Azure AI Search adapter (index management + hybrid query)
- ✅ Search indexing on observation/memory write
- ✅ Search route with BM25 + vector + configurable weights
- ✅ Graph routes (node/edge CRUD + traversal)
- ✅ Graph extraction from observations (LLM-based)
- ✅ Updated Bicep (AI Search resource)

**Validation:** Search returns semantically relevant results for natural language queries.

### Phase 4: Polish & Deploy

**Goal:** Production-ready deployment with full IaC and CI/CD.

**Deliverables:**

- ✅ Rate limiting middleware
- ✅ RBAC enforcement on all routes
- ✅ GDPR tenant purge endpoint
- ✅ Export endpoint
- ✅ Full Bicep (all Azure resources + networking)
- ✅ GitHub Actions CI/CD (build → test → deploy)
- ✅ README with deployment guide
- ✅ API documentation
- ✅ OpenTelemetry → Azure Monitor integration

**Validation:** Full end-to-end demo works on fresh Azure deployment.

---

## 13. Future Considerations

### Post-MVP Enhancements

- **Event Hubs Pipeline:** Async observation processing for high throughput
- **Azure Functions:** Background consolidation, graph extraction, cleanup jobs
- **API Management:** Enterprise API gateway with full analytics
- **Memory Consolidation:** Periodic LLM-based summarization (observations → memories)
- **Multi-tier Storage:** Redis (hot) → Cosmos (warm) → Data Lake (cold)

### Advanced Features

- **Cross-Agent Federation:** Shared memory pools between agents
- **Procedural Memory:** Learned workflows and routines
- **Actions & Routines:** Agentic task management primitives
- **Semantic Memory:** Higher-order facts distilled from episodic memory
- **Memory Lifecycle Policies:** Auto-expire, auto-archive, strength decay

### Integration Opportunities

- **PursuitIQ Integration:** Agent memory for sales research agents
- **Copilot Extensions:** Memory plugin for GitHub Copilot
- **LangChain/LangGraph:** Drop-in memory backend
- **Semantic Kernel:** .NET agent memory provider

---

## 14. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | **Azure OpenAI latency** adds 2-5s per observation for compression | High | Medium | Make compression async (fire-and-forget to queue). MVP: accept the latency, optimize later. |
| 2 | **Cosmos DB cost** at scale with serverless mode | Medium | Medium | Start with serverless (pay-per-request). Monitor RU consumption. Switch to provisioned throughput if sustained load. |
| 3 | **AI Search index size** grows unbounded per tenant | Medium | Low | Implement TTL-based index cleanup. Add per-tenant index size limits. |
| 4 | **agentmemory upstream divergence** — fork falls behind | Low | High | Track upstream releases. Cherry-pick relevant fixes. Our Azure adapters are decoupled from core model. |
| 5 | **Auth complexity** with Entra ID across multiple tenants | Medium | Medium | Use multi-tenant app registration. Test with 3+ tenants early. Document setup clearly. |

---

## 15. Appendix

### A. agentmemory → Azure Mapping

| agentmemory Component | File(s) | Azure Replacement |
|----------------------|---------|-------------------|
| iii-sdk KV store | `src/state/kv.ts` | Cosmos DB NoSQL (`@azure/cosmos`) |
| In-process vector index | `src/state/vector-index.ts` | Azure AI Search vector field |
| In-process BM25 index | `src/state/search-index.ts` | Azure AI Search BM25 |
| Hybrid search | `src/state/hybrid-search.ts` | AI Search hybrid query |
| Graph (KV-backed) | `src/functions/graph-*.ts` | Cosmos DB containers |
| Hooks system | `src/hooks/*.ts` | In-process (MVP) → Event Hubs (future) |
| REST API | `src/triggers/api.ts` | Fastify routes (modular) |
| LLM providers | `src/providers/*.ts` | Azure OpenAI adapter |
| Embeddings | `src/providers/embedding/` | Azure OpenAI embeddings |
| Local disk | `iii-config.yaml` | Blob Storage |
| No auth | — | Entra ID + JWT middleware |
| No telemetry | `src/telemetry/` | Azure Monitor + App Insights |

### B. Key Dependencies

- [agentmemory (upstream)](https://github.com/rohitg00/agentmemory) — Apache-2.0
- [Azure Cosmos DB SDK](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/cosmosdb/cosmos)
- [Azure AI Search SDK](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/search/search-documents)
- [Azure OpenAI SDK](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/openai/openai)
- [Fastify](https://fastify.dev/)

### C. Estimated Azure Costs (MVP)

| Service | SKU | Est. Monthly |
|---------|-----|-------------|
| Container Apps | Consumption (0.5 vCPU, 1 GiB) | $0-10 |
| Cosmos DB | Serverless | $5-25 |
| AI Search | Basic (1 replica) | $75 |
| Azure OpenAI | Pay-per-token (~100K tokens/day) | $30-50 |
| Blob Storage | Standard LRS (< 1 GB) | < $1 |
| Monitor | Free tier | $0 |
| **Total** | | **~$110-160/mo** |
