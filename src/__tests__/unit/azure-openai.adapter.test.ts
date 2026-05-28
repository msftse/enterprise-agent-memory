import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmbeddingsCreate = vi.fn();
const mockChatCompletionsCreate = vi.fn();

vi.mock("openai", () => ({
	AzureOpenAI: vi.fn(() => ({
		embeddings: { create: mockEmbeddingsCreate },
		chat: { completions: { create: mockChatCompletionsCreate } },
	})),
}));

vi.mock("@azure/identity", () => ({
	DefaultAzureCredential: vi.fn(),
	getBearerTokenProvider: vi.fn(() => () => "mock-token"),
}));

vi.mock("@azure/openai", () => ({}));

const defaultConfig: {
	AZURE_OPENAI_ENDPOINT?: string;
	AZURE_OPENAI_API_KEY?: string;
	AZURE_OPENAI_DEPLOYMENT_CHAT: string;
	AZURE_OPENAI_DEPLOYMENT_EMBEDDING: string;
	AZURE_OPENAI_API_VERSION: string;
} = {
	AZURE_OPENAI_ENDPOINT: "https://test.openai.azure.com/",
	AZURE_OPENAI_API_KEY: "test-api-key",
	AZURE_OPENAI_DEPLOYMENT_CHAT: "gpt-4o",
	AZURE_OPENAI_DEPLOYMENT_EMBEDDING: "text-embedding-3-large",
	AZURE_OPENAI_API_VERSION: "2024-12-01-preview",
};

const mockGetConfig = vi.fn(() => ({ ...defaultConfig }));

vi.mock("../../config/azure.config.js", () => ({
	getConfig: () => mockGetConfig(),
}));

import { AzureOpenAIAdapter } from "../../adapters/azure-openai.adapter.js";

describe("AzureOpenAIAdapter", () => {
	beforeEach(() => {
		mockEmbeddingsCreate.mockClear();
		mockChatCompletionsCreate.mockClear();
		mockGetConfig.mockClear().mockReturnValue({ ...defaultConfig });
	});

	describe("isAvailable", () => {
		it("returns true when endpoint is configured", () => {
			const adapter = new AzureOpenAIAdapter();
			expect(adapter.isAvailable).toBe(true);
		});

		it("returns false when neither endpoint nor API key is set", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				AZURE_OPENAI_ENDPOINT: undefined,
				AZURE_OPENAI_API_KEY: undefined,
			});

			const adapter = new AzureOpenAIAdapter();
			expect(adapter.isAvailable).toBe(false);
		});

		it("returns true when only API key is set", () => {
			mockGetConfig.mockReturnValue({
				...defaultConfig,
				AZURE_OPENAI_ENDPOINT: undefined,
				AZURE_OPENAI_API_KEY: "some-key",
			});

			const adapter = new AzureOpenAIAdapter();
			expect(adapter.isAvailable).toBe(true);
		});
	});

	describe("embed", () => {
		it("generates embedding for text", async () => {
			mockEmbeddingsCreate.mockResolvedValueOnce({
				data: [{ embedding: [0.1, 0.2, 0.3] }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.embed("test text");

			expect(result).toEqual([0.1, 0.2, 0.3]);
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "text-embedding-3-large",
					input: ["test text"],
				}),
			);
		});
	});

	describe("embedBatch", () => {
		it("embeds multiple texts in batches of 16", async () => {
			mockEmbeddingsCreate.mockResolvedValue({
				data: [{ embedding: [0.1] }, { embedding: [0.2] }],
			});

			const adapter = new AzureOpenAIAdapter();
			const texts = Array.from({ length: 18 }, (_, i) => `text-${i}`);
			const result = await adapter.embedBatch(texts);

			// 18 texts → 2 batches (16 + 2)
			expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
			// Each batch returns 2 embeddings in our mock, so 2+2=4
			expect(result).toHaveLength(4);
		});
	});

	describe("compress", () => {
		it("sends system+user messages and returns response", async () => {
			mockChatCompletionsCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "compressed output" } }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.compress("system prompt", "user content");

			expect(result).toBe("compressed output");
			expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4o",
					messages: [
						{ role: "system", content: "system prompt" },
						{ role: "user", content: "user content" },
					],
					temperature: 0.3,
				}),
			);
		});

		it("returns empty string when no content in response", async () => {
			mockChatCompletionsCreate.mockResolvedValueOnce({
				choices: [{ message: { content: null } }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.compress("sys", "user");

			expect(result).toBe("");
		});
	});

	describe("summarize", () => {
		it("summarizes content with lower temperature", async () => {
			mockChatCompletionsCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "summary" } }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.summarize("system", "content");

			expect(result).toBe("summary");
			expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
				expect.objectContaining({ temperature: 0.2 }),
			);
		});
	});

	describe("extractGraphEntities", () => {
		it("parses valid JSON graph response", async () => {
			const graphData = {
				nodes: [{ type: "person", name: "Alice" }],
				edges: [{ type: "uses", source: "Alice", target: "TypeScript" }],
			};
			mockChatCompletionsCreate.mockResolvedValueOnce({
				choices: [{ message: { content: JSON.stringify(graphData) } }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.extractGraphEntities(
				"Alice uses TypeScript",
			);

			expect(result.nodes).toEqual(graphData.nodes);
			expect(result.edges).toEqual(graphData.edges);
		});

		it("returns empty graph on invalid JSON", async () => {
			mockChatCompletionsCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "not json" } }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.extractGraphEntities("test");

			expect(result.nodes).toEqual([]);
			expect(result.edges).toEqual([]);
		});
	});

	describe("healthCheck", () => {
		it("returns healthy on successful ping", async () => {
			mockChatCompletionsCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "" } }],
			});

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.healthCheck();

			expect(result.status).toBe("healthy");
			expect(result.model).toBe("gpt-4o");
		});

		it("returns unhealthy on error", async () => {
			mockChatCompletionsCreate.mockRejectedValueOnce(new Error("timeout"));

			const adapter = new AzureOpenAIAdapter();
			const result = await adapter.healthCheck();

			expect(result.status).toBe("unhealthy");
		});
	});
});
