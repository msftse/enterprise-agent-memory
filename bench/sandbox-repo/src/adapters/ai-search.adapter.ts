import {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
  type SearchIndex,
  type SearchField,
  type VectorSearch,
  type SemanticConfiguration,
  type SemanticSearch,
} from '@azure/search-documents';
import { DefaultAzureCredential } from '@azure/identity';
import { getConfig } from '../config/azure.config.js';

type Credential = DefaultAzureCredential | AzureKeyCredential;

interface SearchDocument {
  id: string;
  tenantId: string;
  docType: 'observation' | 'memory';
  sessionId?: string;
  project?: string;
  title: string;
  content: string;
  concepts: string[];
  files: string[];
  type: string;
  importance?: number;
  strength?: number;
  timestamp: string;
  embedding?: number[];
}

const VECTOR_DIMENSIONS = 3072;
const VECTOR_CONFIG_NAME = 'embedding-vector';
const VECTOR_FIELD_NAME = 'embedding';

export class AISearchAdapter {
  private searchClient: SearchClient<SearchDocument> | null = null;
  private indexClient: SearchIndexClient | null = null;
  private initialized = false;

  private getCredential(): Credential {
    const config = getConfig();
    return config.AI_SEARCH_ADMIN_KEY
      ? new AzureKeyCredential(config.AI_SEARCH_ADMIN_KEY)
      : new DefaultAzureCredential();
  }

  private getSearchClient(): SearchClient<SearchDocument> {
    if (!this.searchClient) {
      const config = getConfig();
      this.searchClient = new SearchClient<SearchDocument>(
        config.AI_SEARCH_ENDPOINT,
        config.AI_SEARCH_INDEX,
        this.getCredential(),
      );
    }
    return this.searchClient;
  }

  private getIndexClient(): SearchIndexClient {
    if (!this.indexClient) {
      const config = getConfig();
      this.indexClient = new SearchIndexClient(
        config.AI_SEARCH_ENDPOINT,
        this.getCredential(),
      );
    }
    return this.indexClient;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const config = getConfig();
    const indexClient = this.getIndexClient();

    const fields: SearchField[] = [
      { name: 'id', type: 'Edm.String', key: true, filterable: true },
      { name: 'tenantId', type: 'Edm.String', filterable: true },
      { name: 'docType', type: 'Edm.String', filterable: true, facetable: true },
      { name: 'sessionId', type: 'Edm.String', filterable: true },
      { name: 'project', type: 'Edm.String', filterable: true, facetable: true },
      { name: 'title', type: 'Edm.String', searchable: true },
      { name: 'content', type: 'Edm.String', searchable: true },
      {
        name: 'concepts',
        type: 'Collection(Edm.String)',
        searchable: true,
        filterable: true,
      },
      {
        name: 'files',
        type: 'Collection(Edm.String)',
        searchable: true,
        filterable: true,
      },
      { name: 'type', type: 'Edm.String', filterable: true, facetable: true },
      { name: 'importance', type: 'Edm.Double', filterable: true, sortable: true },
      { name: 'strength', type: 'Edm.Double', filterable: true, sortable: true },
      { name: 'timestamp', type: 'Edm.DateTimeOffset', filterable: true, sortable: true },
      {
        name: VECTOR_FIELD_NAME,
        type: 'Collection(Edm.Single)',
        searchable: true,
        vectorSearchDimensions: VECTOR_DIMENSIONS,
        vectorSearchProfileName: VECTOR_CONFIG_NAME,
      },
    ];

    const vectorSearch: VectorSearch = {
      algorithms: [{ name: 'hnsw-algo', kind: 'hnsw' }],
      profiles: [
        {
          name: VECTOR_CONFIG_NAME,
          algorithmConfigurationName: 'hnsw-algo',
        },
      ],
    };

    const semanticConfig: SemanticConfiguration = {
      name: 'default-semantic',
      prioritizedFields: {
        contentFields: [{ name: 'content' }],
        titleField: { name: 'title' },
      },
    };

    const semanticSearch: SemanticSearch = {
      configurations: [semanticConfig],
      defaultConfigurationName: 'default-semantic',
    };

    const indexDef: SearchIndex = {
      name: config.AI_SEARCH_INDEX,
      fields,
      vectorSearch,
      semanticSearch,
    };

    await indexClient.createOrUpdateIndex(indexDef);
    this.initialized = true;
  }

  async indexDocument(doc: SearchDocument): Promise<void> {
    await this.ensureInitialized();
    const client = this.getSearchClient();
    await client.mergeOrUploadDocuments([doc]);
  }

  async indexDocumentBatch(docs: SearchDocument[]): Promise<void> {
    await this.ensureInitialized();
    const client = this.getSearchClient();
    await client.mergeOrUploadDocuments(docs);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.ensureInitialized();
    const client = this.getSearchClient();
    await client.deleteDocuments([{ id } as SearchDocument]);
  }

  async hybridSearch(params: {
    tenantId: string;
    query: string;
    queryVector?: number[];
    docType?: 'observation' | 'memory';
    sessionId?: string;
    project?: string;
    limit?: number;
    filters?: {
      type?: string[];
      dateFrom?: string;
      dateTo?: string;
      minImportance?: number;
    };
  }): Promise<
    Array<SearchDocument & { score: number; bm25Score: number; vectorScore: number }>
  > {
    await this.ensureInitialized();
    const client = this.getSearchClient();
    const limit = params.limit ?? 20;

    const filterParts: string[] = [`tenantId eq '${params.tenantId}'`];
    if (params.docType) {
      filterParts.push(`docType eq '${params.docType}'`);
    }
    if (params.sessionId) {
      filterParts.push(`sessionId eq '${params.sessionId}'`);
    }
    if (params.project) {
      filterParts.push(`project eq '${params.project}'`);
    }
    if (params.filters?.type && params.filters.type.length > 0) {
      const typeClauses = params.filters.type
        .map((t) => `type eq '${t}'`)
        .join(' or ');
      filterParts.push(`(${typeClauses})`);
    }
    if (params.filters?.dateFrom) {
      filterParts.push(`timestamp ge ${params.filters.dateFrom}`);
    }
    if (params.filters?.dateTo) {
      filterParts.push(`timestamp le ${params.filters.dateTo}`);
    }
    if (params.filters?.minImportance !== undefined) {
      filterParts.push(`importance ge ${params.filters.minImportance}`);
    }

    const filter = filterParts.join(' and ');

    const vectorSearchOptions = params.queryVector
      ? {
          queries: [
            {
              kind: 'vector' as const,
              vector: params.queryVector,
              fields: [VECTOR_FIELD_NAME] as const,
              kNearestNeighborsCount: limit,
            },
          ],
        }
      : undefined;

    const searchResult = await client.search(params.query, {
      filter,
      top: limit,
      vectorSearchOptions,
      queryType: 'simple',
    });

    const items: Array<
      SearchDocument & { score: number; bm25Score: number; vectorScore: number }
    > = [];

    for await (const result of searchResult.results) {
      const doc = result.document;
      items.push({
        ...doc,
        score: result.score ?? 0,
        // Individual sub-scores are not always available; default to the combined score
        bm25Score: result.score ?? 0,
        vectorScore: result.score ?? 0,
      });
    }

    return items;
  }

  async purgeTenant(tenantId: string): Promise<number> {
    await this.ensureInitialized();
    const client = this.getSearchClient();

    const filter = `tenantId eq '${tenantId}'`;
    const searchResult = await client.search('*', { filter, select: ['id'] });

    const idsToDelete: SearchDocument[] = [];
    for await (const result of searchResult.results) {
      idsToDelete.push({ id: result.document.id } as SearchDocument);
    }

    if (idsToDelete.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        await client.deleteDocuments(batch);
      }
    }

    return idsToDelete.length;
  }

  async healthCheck(): Promise<{ status: string; documentCount: number }> {
    try {
      await this.ensureInitialized();
      const client = this.getSearchClient();
      const searchResult = await client.search('*', { top: 0, includeTotalCount: true });
      const count = searchResult.count ?? 0;
      return { status: 'healthy', documentCount: count };
    } catch {
      return { status: 'unhealthy', documentCount: 0 };
    }
  }
}
