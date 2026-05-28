import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockAppend = vi.fn();
const mockFlush = vi.fn();
const mockGetFileClient = vi.fn(() => ({
	create: mockCreate,
	append: mockAppend,
	flush: mockFlush,
}));
const mockListPaths = vi.fn();
const mockGetFileSystemClient = vi.fn(() => ({
	getFileClient: mockGetFileClient,
	listPaths: mockListPaths,
}));
const mockGetConfig = vi.fn();

vi.mock("@azure/storage-file-datalake", () => ({
	DataLakeServiceClient: vi.fn(() => ({
		getFileSystemClient: mockGetFileSystemClient,
	})),
}));

vi.mock("@azure/identity", () => ({
	DefaultAzureCredential: vi.fn(),
}));

vi.mock("../../config/azure.config.js", () => ({
	getConfig: () => mockGetConfig(),
}));

import { FabricLakehouseAdapter } from "../../adapters/fabric/lakehouse.adapter.js";

function configured() {
	return {
		FABRIC_ENABLED: true,
		FABRIC_ONELAKE_ENDPOINT: "https://onelake.dfs.fabric.microsoft.com",
		FABRIC_WORKSPACE_ID: "workspace-1",
		FABRIC_LAKEHOUSE_ID: "lakehouse-1",
	};
}

describe("FabricLakehouseAdapter", () => {
	beforeEach(() => {
		mockCreate.mockReset().mockResolvedValue(undefined);
		mockAppend.mockReset().mockResolvedValue(undefined);
		mockFlush.mockReset().mockResolvedValue(undefined);
		mockGetFileClient.mockClear();
		mockGetFileSystemClient.mockClear();
		mockListPaths.mockReset().mockReturnValue({
			byPage: vi.fn(() => ({
				next: vi.fn().mockResolvedValue({ done: true }),
			})),
		});
		mockGetConfig.mockReset().mockReturnValue(configured());
	});

	it("reports availability only when all Fabric config is present", () => {
		const adapter = new FabricLakehouseAdapter();
		expect(adapter.isAvailable).toBe(true);

		mockGetConfig.mockReturnValue({
			...configured(),
			FABRIC_WORKSPACE_ID: undefined,
		});
		expect(adapter.isAvailable).toBe(false);
	});

	it("writes rows as NDJSON under the lakehouse Files path", async () => {
		const adapter = new FabricLakehouseAdapter();

		const result = await adapter.writeRows(
			"sessions",
			[
				{ id: "s1", tenant_id: "tenant-1" },
				{ id: "s2", tenant_id: "tenant-1" },
			],
			"tenant-1",
		);

		expect(mockGetFileSystemClient).toHaveBeenCalledWith("workspace-1");
		expect(mockGetFileClient).toHaveBeenCalledWith(
			expect.stringMatching(
				/^lakehouse-1\/Files\/sessions\/tenant-1\/.+\.jsonl$/,
			),
		);
		expect(mockCreate).toHaveBeenCalled();
		const appendedBuffer = mockAppend.mock.calls[0][0] as Buffer;
		expect(appendedBuffer.toString("utf-8")).toBe(
			'{"id":"s1","tenant_id":"tenant-1"}\n{"id":"s2","tenant_id":"tenant-1"}\n',
		);
		expect(mockFlush).toHaveBeenCalledWith(appendedBuffer.length);
		expect(result).toEqual({ path: expect.any(String), rowCount: 2 });
	});

	it("rejects writes when Fabric is not configured", async () => {
		mockGetConfig.mockReturnValue({ ...configured(), FABRIC_ENABLED: false });
		const adapter = new FabricLakehouseAdapter();

		await expect(adapter.writeRows("sessions", [])).rejects.toThrow(
			"Fabric Lakehouse not configured",
		);
	});

	it("flattens model records for analytics tables", () => {
		const adapter = new FabricLakehouseAdapter();

		expect(
			adapter.flattenSession({
				id: "s1",
				tenantId: "t1",
				project: "p",
				startedAt: "start",
				status: "active",
				observationCount: 1,
				tags: ["a"],
			}),
		).toEqual(
			expect.objectContaining({
				id: "s1",
				tenant_id: "t1",
				project: "p",
				observation_count: 1,
				tags: '["a"]',
			}),
		);
		expect(
			adapter.flattenObservation({
				id: "o1",
				tenantId: "t1",
				sessionId: "s1",
				timestamp: "now",
				type: "other",
				narrative: "content",
				importance: 5,
			}),
		).toEqual(
			expect.objectContaining({
				id: "o1",
				content: "content",
				narrative: "content",
			}),
		);
		expect(
			adapter.flattenMemory({
				id: "m1",
				tenantId: "t1",
				createdAt: "c",
				updatedAt: "u",
				type: "fact",
				title: "T",
				content: "C",
				strength: 1,
				version: 1,
				isLatest: true,
			}),
		).toEqual(
			expect.objectContaining({ id: "m1", is_latest: true, concepts: "[]" }),
		);
		expect(
			adapter.flattenGraphNode({
				id: "n1",
				tenantId: "t1",
				type: "file",
				name: "src/index.ts",
				createdAt: "now",
				properties: { language: "ts" },
				aliases: ["entry"],
			}),
		).toEqual(
			expect.objectContaining({
				id: "n1",
				properties: '{"language":"ts"}',
				aliases: '["entry"]',
			}),
		);
		expect(
			adapter.flattenGraphEdge({
				id: "e1",
				tenantId: "t1",
				type: "uses",
				sourceNodeId: "n1",
				targetNodeId: "n2",
				weight: 1,
				createdAt: "now",
			}),
		).toEqual(
			expect.objectContaining({
				id: "e1",
				source_node_id: "n1",
				target_node_id: "n2",
			}),
		);
	});

	it("performs full sync for tenant-filtered data", async () => {
		const adapter = new FabricLakehouseAdapter();
		const writeSpy = vi
			.spyOn(adapter, "writeRows")
			.mockResolvedValue({ path: "path", rowCount: 1 });
		const query = async <T>(
			container: string,
			spec: { query: string },
		): Promise<T[]> => {
			expect(spec.query).toContain("WHERE c.tenantId = 'tenant-1'");
			const rowsByContainer: Record<string, Array<Record<string, string>>> = {
				sessions: [{ id: "s1", tenantId: "tenant-1" }],
				observations: [{ id: "o1", tenantId: "tenant-1" }],
				memories: [{ id: "m1", tenantId: "tenant-1" }],
				"graph-nodes": [{ id: "n1", tenantId: "tenant-1" }],
				"graph-edges": [{ id: "e1", tenantId: "tenant-1" }],
			};
			return (rowsByContainer[container] ?? []) as T[];
		};
		const cosmos: Parameters<typeof adapter.fullSync>[0] = {
			query,
		};

		const result = await adapter.fullSync(cosmos, "tenant-1");

		expect(writeSpy).toHaveBeenCalledTimes(5);
		expect(writeSpy).toHaveBeenCalledWith(
			"sessions",
			expect.any(Array),
			"tenant-1",
		);
		expect(result).toEqual({
			sessions: 1,
			observations: 1,
			memories: 1,
			graphNodes: 1,
			graphEdges: 1,
		});
	});

	it("skips empty tables during full sync", async () => {
		const adapter = new FabricLakehouseAdapter();
		const writeSpy = vi
			.spyOn(adapter, "writeRows")
			.mockResolvedValue({ path: "path", rowCount: 1 });
		const cosmos = { query: vi.fn().mockResolvedValue([]) };

		const result = await adapter.fullSync(cosmos);

		expect(writeSpy).not.toHaveBeenCalled();
		expect(result).toEqual({
			sessions: 0,
			observations: 0,
			memories: 0,
			graphNodes: 0,
			graphEdges: 0,
		});
	});

	it("returns health states for unconfigured, healthy, and unhealthy lakehouses", async () => {
		mockGetConfig.mockReturnValueOnce({
			...configured(),
			FABRIC_ENABLED: false,
		});
		await expect(new FabricLakehouseAdapter().healthCheck()).resolves.toEqual({
			status: "not_configured",
		});

		mockGetConfig.mockReturnValue(configured());
		await expect(new FabricLakehouseAdapter().healthCheck()).resolves.toEqual({
			status: "healthy",
			workspace: "workspace-1",
		});

		mockListPaths.mockReturnValueOnce({
			byPage: vi.fn(() => ({
				next: vi.fn().mockRejectedValue(new Error("down")),
			})),
		});
		await expect(new FabricLakehouseAdapter().healthCheck()).resolves.toEqual({
			status: "unhealthy",
		});
	});
});
