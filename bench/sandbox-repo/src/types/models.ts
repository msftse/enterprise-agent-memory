// ---------------------------------------------------------------------------
// Enterprise Agent Memory — Domain Models
// Ported from agentmemory with `tenantId` added to all top-level entities
// and `embedding` added to CompressedObservation / Memory for AI Search.
// ---------------------------------------------------------------------------

// ---- Sessions ----

export interface Session {
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

// ---- Observations ----

export type ObservationType =
  | "file_read"
  | "file_write"
  | "file_edit"
  | "command_run"
  | "search"
  | "web_fetch"
  | "conversation"
  | "error"
  | "decision"
  | "discovery"
  | "subagent"
  | "notification"
  | "task"
  | "image"
  | "other";

export type HookType =
  | "session_start"
  | "prompt_submit"
  | "pre_tool_use"
  | "post_tool_use"
  | "post_tool_failure"
  | "pre_compact"
  | "subagent_start"
  | "subagent_stop"
  | "notification"
  | "task_completed"
  | "stop"
  | "session_end";

export interface HookPayload {
  hookType: HookType;
  sessionId: string;
  project: string;
  cwd: string;
  timestamp: string;
  data: unknown;
}

export interface RawObservation {
  id: string;
  tenantId: string;
  sessionId: string;
  timestamp: string;
  hookType: HookType;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  userPrompt?: string;
  assistantResponse?: string;
  raw: unknown;
  modality?: "text" | "image" | "mixed";
  imageData?: string;
}

export interface CompressedObservation {
  id: string;
  tenantId: string;
  sessionId: string;
  timestamp: string;
  type: ObservationType;
  title: string;
  subtitle?: string;
  facts: string[];
  content: string;
  /** @deprecated Use `content` instead. Alias kept for backward compatibility. */
  narrative: string;
  concepts: string[];
  files: string[];
  importance: number;
  confidence?: number;
  imageRef?: string;
  imageData?: string;
  imageDescription?: string;
  modality?: "text" | "image" | "mixed";
  embedding?: number[];
}

// ---- Memories ----

export interface Memory {
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
  parentId?: string;
  supersedes?: string[];
  relatedIds?: string[];
  sourceObservationIds?: string[];
  isLatest: boolean;
  forgetAfter?: string;
  imageRef?: string;
  imageData?: string;
  embedding?: number[];
  // Phase 2: token-savings instrumentation
  sourceTokens?: number;       // prompt_tokens of the compression call
  compressedTokens?: number;   // completion_tokens of the compression call
  recallCount?: number;        // incremented on each search hit
  actor?: string;              // 'roey' | 'shiron' | undefined — from x-api-key prefix
}

export interface MemoryRelation {
  type: "supersedes" | "extends" | "derives" | "contradicts" | "related";
  sourceId: string;
  targetId: string;
  createdAt: string;
  confidence?: number;
}

// ---- Session Summaries ----

export interface SessionSummary {
  sessionId: string;
  tenantId: string;
  project: string;
  createdAt: string;
  title: string;
  narrative: string;
  keyDecisions: string[];
  filesModified: string[];
  concepts: string[];
  observationCount: number;
}

// ---- Knowledge Graph ----

export type GraphNodeType =
  | "file"
  | "function"
  | "concept"
  | "error"
  | "decision"
  | "pattern"
  | "library"
  | "person"
  | "project"
  | "preference"
  | "location"
  | "organization"
  | "event";

export interface GraphNode {
  id: string;
  tenantId: string;
  type: GraphNodeType;
  name: string;
  properties: Record<string, unknown>;
  sourceObservationIds: string[];
  createdAt: string;
  updatedAt?: string;
  aliases?: string[];
  stale?: boolean;
}

export type GraphEdgeType =
  | "uses"
  | "imports"
  | "modifies"
  | "causes"
  | "fixes"
  | "depends_on"
  | "related_to"
  | "works_at"
  | "prefers"
  | "blocked_by"
  | "caused_by"
  | "optimizes_for"
  | "rejected"
  | "avoids"
  | "located_in"
  | "succeeded_by";

export interface GraphEdge {
  id: string;
  tenantId: string;
  type: GraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  weight: number;
  sourceObservationIds: string[];
  createdAt: string;
  tcommit?: string;
  tvalid?: string;
  tvalidEnd?: string;
  context?: EdgeContext;
  version?: number;
  supersededBy?: string;
  isLatest?: boolean;
  stale?: boolean;
}

export interface EdgeContext {
  reasoning?: string;
  sentiment?: string;
  alternatives?: string[];
  situationalFactors?: string[];
  confidence?: number;
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

// ---- Search ----

export interface SearchResult {
  observation: CompressedObservation;
  score: number;
  sessionId: string;
}

export interface HybridSearchResult {
  observation: CompressedObservation;
  bm25Score: number;
  vectorScore: number;
  graphScore: number;
  combinedScore: number;
  sessionId: string;
  graphContext?: string;
}

// ---- Context ----

export interface ContextBlock {
  type: "summary" | "observation" | "memory";
  content: string;
  tokens: number;
  recency: number;
  sourceIds?: string[];
}

// ---- Health ----

export interface HealthSnapshot {
  connectionState: string;
  workers: Array<{ id: string; name: string; status: string }>;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  cpu: { userMicros: number; systemMicros: number; percent: number };
  eventLoopLagMs: number;
  uptimeSeconds: number;
  kvConnectivity?: { status: string; latencyMs?: number; error?: string };
  status: "healthy" | "degraded" | "critical";
  alerts: string[];
  notes?: string[];
}

// ---- Providers ----

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  embedImage?(src: string): Promise<Float32Array>;
}

export interface MemoryProvider {
  name: string;
  compress(systemPrompt: string, userPrompt: string): Promise<string>;
  summarize(systemPrompt: string, userPrompt: string): Promise<string>;
  describeImage?(imageData: string, mimeType: string, prompt: string): Promise<string>;
}

// ---- Audit ----

export interface AuditEntry {
  id: string;
  tenantId: string;
  timestamp: string;
  operation:
    | "observe"
    | "compress"
    | "remember"
    | "forget"
    | "evolve"
    | "consolidate"
    | "share"
    | "delete"
    | "import"
    | "export"
    | "action_create"
    | "action_update"
    | "lease_acquire"
    | "lease_release"
    | "routine_run"
    | "signal_send"
    | "checkpoint_resolve"
    | "mesh_sync"
    | "relation_create"
    | "relation_update"
    | "sentinel_create"
    | "sentinel_trigger"
    | "sketch_create"
    | "sketch_promote"
    | "retention_score"
    | "sketch_discard"
    | "crystallize"
    | "diagnose"
    | "heal"
    | "facet_tag"
    | "lesson_save"
    | "lesson_recall"
    | "lesson_strengthen"
    | "obsidian_export"
    | "reflect"
    | "insight_search"
    | "skill_extract"
    | "core_add"
    | "core_remove"
    | "auto_page"
    | "vision_embed"
    | "slot_append"
    | "slot_replace"
    | "slot_create"
    | "slot_delete"
    | "slot_reflect";
  userId?: string;
  functionId: string;
  targetIds: string[];
  details: Record<string, unknown>;
  qualityScore?: number;
}
