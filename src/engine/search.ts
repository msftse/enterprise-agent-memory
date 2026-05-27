import type { AzureOpenAIAdapter } from '../adapters/azure-openai.adapter.js';
import type { AISearchAdapter } from '../adapters/ai-search.adapter.js';
import type { CosmosAdapter } from '../adapters/cosmos.adapter.js';
import type { SearchRequest, SearchResponse } from '../types/api.js';

export interface SearchContext {
  openai: AzureOpenAIAdapter;
  search: AISearchAdapter;
  cosmos: CosmosAdapter;
}

export async function hybridSearch(
  tenantId: string,
  request: SearchRequest,
  ctx: SearchContext,
): Promise<SearchResponse> {
  const startTime = Date.now();

  // Generate query embedding
  const queryVector = await ctx.openai.embed(request.query);

  // Execute hybrid search
  const results = await ctx.search.hybridSearch({
    tenantId,
    query: request.query,
    queryVector,
    docType:
      request.scope === 'all'
        ? undefined
        : request.scope === 'observations'
          ? 'observation'
          : 'memory',
    sessionId: request.sessionId,
    project: request.project,
    limit: request.limit ?? 10,
    filters: request.filters,
  });

  // Phase 2: fire-and-forget recall counter on each memory hit.
  // We don't await — search latency must not depend on bookkeeping.
  const memoryHits = results.filter((r) => r.docType === 'memory');
  if (memoryHits.length > 0) {
    void Promise.allSettled(
      memoryHits.map((h) => ctx.cosmos.incrementMemoryRecallCount(h.id, tenantId)),
    );
  }

  return {
    results: results.map((r) => ({
      type: r.docType,
      id: r.id,
      title: r.title,
      content: r.content,
      score: r.score,
      bm25Score: r.bm25Score,
      vectorScore: r.vectorScore,
    })),
    totalCount: results.length,
    searchDurationMs: Date.now() - startTime,
  };
}
