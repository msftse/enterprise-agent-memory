import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateOrUpdateIndex = vi.fn();
const mockMergeOrUploadDocuments = vi.fn();
const mockDeleteDocuments = vi.fn();
const mockSearch = vi.fn();
const mockGetConfig = vi.fn();

vi.mock("@azure/search-documents", () => ({
	AzureKeyCredential: vi.fn(function AzureKeyCredential(
		this: { key?: string },
		key: string,
	) {
		this.key = key;
	}),
	SearchClient: vi.fn(() => ({
		mergeOrUploadDocuments: mockMergeOrUploadDocuments,
		deleteDocuments: mockDeleteDocuments,
		search: mockSearch,
	})),
	SearchIndexClient: vi.fn(() => ({
		createOrUpdateIndex: mockCreateOrUpdateIndex,
	})),
}));

vi.mock("@azure/identity", () => ({
	DefaultAzureCredential: vi.fn(),
}));

vi.mock("../../config/azure.config.js", () => ({
	getConfig: () => mockGetConfig(),
}));

import { AISearchAdapter } from "../../adapters/ai-search.adapter.js";

interface MockSearchResult {
	document: Record<string, unknown>;
	score?: number;
}

async function* searchResults(items: MockSearchResult[]) {
	for (const item of items) {
		yield item;
	}
}

describe("AISearchAdapter", () => {
	beforeEach(() => {
		mockCreateOrUpdateIndex.mockReset().mockResolvedValue(undefined);
		mockMergeOrUploadDocuments.mockReset().mockResolvedValue(undefined);
		mockDeleteDocuments.mockReset().mockResolvedValue(undefined);
		mockSearch
			.mockReset()
			.mockReturnValue({ results: searchResults([]), count: 0 });
		mockGetConfig.mockReset().mockReturnValue({
			AI_SEARCH_ENDPOINT: "https://test.search.windows.net",
			AI_SEARCH_INDEX: "agent-memory",
			AI_SEARCH_ADMIN_KEY: "search-key",
		});
	});

	it("creates or updates the search index with vector and semantic configuration", async () => {
		const adapter = new AISearchAdapter();

		await adapter.ensureInitialized();

		expect(mockCreateOrUpdateIndex).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "agent-memory",
				fields: expect.arrayContaining([
					expect.objectContaining({ name: "tenantId", filterable: true }),
					expect.objectContaining({
						name: "embedding",
						vectorSearchDimensions: 3072,
						vectorSearchProfileName: "embedding-vector",
					}),
				]),
				vectorSearch: expect.objectContaining({
					profiles: [
						expect.objectContaining({
							name: "embedding-vector",
							algorithmConfigurationName: "hnsw-algo",
						}),
					],
				}),
				semanticSearch: expect.objectContaining({
					defaultConfigurationName: "default-semantic",
				}),
			}),
		);
	});

	it("indexes one document using mergeOrUploadDocuments", async () => {
		const adapter = new AISearchAdapter();
		const doc = {
			id: "doc-1",
			tenantId: "tenant-1",
			docType: "memory" as const,
			title: "Title",
			content: "Content",
			concepts: [],
			files: [],
			type: "fact",
			timestamp: "2024-01-01T00:00:00Z",
		};

		await adapter.indexDocument(doc);

		expect(mockMergeOrUploadDocuments).toHaveBeenCalledWith([doc]);
	});

	it("indexes document batches as provided", async () => {
		const adapter = new AISearchAdapter();
		const docs = [
			{
				id: "doc-1",
				tenantId: "tenant-1",
				docType: "observation" as const,
				title: "T1",
				content: "C1",
				concepts: [],
				files: [],
				type: "other",
				timestamp: "2024-01-01T00:00:00Z",
			},
			{
				id: "doc-2",
				tenantId: "tenant-1",
				docType: "memory" as const,
				title: "T2",
				content: "C2",
				concepts: [],
				files: [],
				type: "fact",
				timestamp: "2024-01-01T00:00:00Z",
			},
		];

		await adapter.indexDocumentBatch(docs);

		expect(mockMergeOrUploadDocuments).toHaveBeenCalledWith(docs);
	});

	it("deletes documents by id", async () => {
		const adapter = new AISearchAdapter();

		await adapter.deleteDocument("doc-1");

		expect(mockDeleteDocuments).toHaveBeenCalledWith([{ id: "doc-1" }]);
	});

	it("runs tenant-scoped hybrid search with filters and vector query", async () => {
		mockSearch.mockReturnValueOnce({
			results: searchResults([
				{
					document: {
						id: "doc-1",
						tenantId: "tenant-1",
						docType: "memory",
						title: "Result",
						content: "Content",
						concepts: [],
						files: [],
						type: "fact",
						timestamp: "2024-01-01T00:00:00Z",
					},
					score: 0.75,
				},
			]),
		});
		const adapter = new AISearchAdapter();

		const results = await adapter.hybridSearch({
			tenantId: "tenant-1",
			query: "auth errors",
			queryVector: [0.1, 0.2],
			docType: "memory",
			sessionId: "session-1",
			project: "project-1",
			limit: 5,
			filters: {
				type: ["fact", "pattern"],
				dateFrom: "2024-01-01T00:00:00Z",
				dateTo: "2024-12-31T00:00:00Z",
				minImportance: 3,
			},
		});

		expect(mockSearch).toHaveBeenCalledWith(
			"auth errors",
			expect.objectContaining({
				top: 5,
				queryType: "simple",
				filter: expect.stringContaining("tenantId eq 'tenant-1'"),
				vectorSearchOptions: {
					queries: [
						{
							kind: "vector",
							vector: [0.1, 0.2],
							fields: ["embedding"],
							kNearestNeighborsCount: 5,
						},
					],
				},
			}),
		);
		const searchOptions = mockSearch.mock.calls[0][1];
		expect(searchOptions.filter).toContain("docType eq 'memory'");
		expect(searchOptions.filter).toContain("sessionId eq 'session-1'");
		expect(searchOptions.filter).toContain("project eq 'project-1'");
		expect(searchOptions.filter).toContain(
			"type eq 'fact' or type eq 'pattern'",
		);
		expect(searchOptions.filter).toContain("timestamp ge 2024-01-01T00:00:00Z");
		expect(searchOptions.filter).toContain("timestamp le 2024-12-31T00:00:00Z");
		expect(searchOptions.filter).toContain("importance ge 3");
		expect(results).toEqual([
			expect.objectContaining({
				id: "doc-1",
				score: 0.75,
				bm25Score: 0.75,
				vectorScore: 0.75,
			}),
		]);
	});

	it("omits vector search options when no query vector is provided", async () => {
		const adapter = new AISearchAdapter();

		await adapter.hybridSearch({ tenantId: "tenant-1", query: "text only" });

		expect(mockSearch).toHaveBeenCalledWith(
			"text only",
			expect.objectContaining({ vectorSearchOptions: undefined }),
		);
	});

	it("purges tenant documents in delete batches", async () => {
		const docs = Array.from({ length: 1001 }, (_, i) => ({
			document: { id: `doc-${i}` },
			score: 1,
		}));
		mockSearch.mockReturnValueOnce({ results: searchResults(docs) });
		const adapter = new AISearchAdapter();

		const count = await adapter.purgeTenant("tenant-1");

		expect(count).toBe(1001);
		expect(mockDeleteDocuments).toHaveBeenCalledTimes(2);
		expect(mockDeleteDocuments.mock.calls[0][0]).toHaveLength(1000);
		expect(mockDeleteDocuments.mock.calls[1][0]).toHaveLength(1);
	});

	it("returns healthy with document count when health query succeeds", async () => {
		mockSearch.mockReturnValueOnce({ results: searchResults([]), count: 42 });
		const adapter = new AISearchAdapter();

		const result = await adapter.healthCheck();

		expect(result).toEqual({ status: "healthy", documentCount: 42 });
	});

	it("returns unhealthy when health query fails", async () => {
		mockSearch.mockImplementationOnce(() => {
			throw new Error("search down");
		});
		const adapter = new AISearchAdapter();

		const result = await adapter.healthCheck();

		expect(result).toEqual({ status: "unhealthy", documentCount: 0 });
	});
});
