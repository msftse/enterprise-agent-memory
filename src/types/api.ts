// ---------------------------------------------------------------------------
// Enterprise Agent Memory — API Request / Response Types
// ---------------------------------------------------------------------------

import type { Memory, Session } from './models.js';

// Re-export model types commonly used alongside API types.
export type {
  CompressedObservation,
  GraphNode,
  GraphEdge,
  HybridSearchResult,
} from './models.js';

// ---- Response Envelope ----

export interface ApiResponse<T> {
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    tenantId: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    status: number;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

// ---- Pagination ----

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// ---- Session Requests ----

export interface CreateSessionRequest {
  project: string;
  cwd: string;
  model?: string;
  tags?: string[];
  firstPrompt?: string;
}

export interface UpdateSessionRequest {
  status?: Session['status'];
  tags?: string[];
  summary?: string;
}

// ---- Observation Requests ----

export interface CaptureObservationRequest {
  sessionId: string;
  hookType: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  assistantResponse?: string;
  raw?: unknown;
}

// ---- Memory Requests ----

export interface CreateMemoryRequest {
  type: Memory['type'];
  title: string;
  content: string;
  concepts?: string[];
  files?: string[];
  sessionIds?: string[];
}

export interface EvolveMemoryRequest {
  content: string;
  concepts?: string[];
  files?: string[];
}

// ---- Search Requests ----

export interface SearchRequest {
  query: string;
  scope?: 'observations' | 'memories' | 'all';
  sessionId?: string;
  project?: string;
  limit?: number;
  bm25Weight?: number;
  vectorWeight?: number;
  graphBoost?: boolean;
  filters?: {
    type?: string[];
    dateFrom?: string;
    dateTo?: string;
    minImportance?: number;
  };
}

export interface SearchResponse {
  results: Array<{
    type: 'observation' | 'memory';
    id: string;
    title: string;
    content: string;
    score: number;
    bm25Score: number;
    vectorScore: number;
  }>;
  totalCount: number;
  searchDurationMs: number;
}

// ---- Graph Requests ----

export interface TraverseGraphRequest {
  startNodeId: string;
  direction?: 'outbound' | 'inbound' | 'both';
  maxDepth?: number;
  edgeTypes?: string[];
}

// ---- Admin ----

export interface TenantPurgeResponse {
  deletedCounts: {
    sessions: number;
    observations: number;
    memories: number;
    graphNodes: number;
    graphEdges: number;
    auditEntries: number;
  };
}

// ---- List Query Params ----

export interface ListParams {
  offset?: number;
  limit?: number;
  project?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
