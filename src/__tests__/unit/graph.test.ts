import { describe, expect, it, vi } from "vitest";
import {
	type GraphContext,
	createGraphEdge,
	createGraphNode,
	extractEntities,
	traverseGraph,
} from "../../engine/graph.js";

function createMockCtx(
	overrides?: Partial<{
		queryResults: Record<string, any[]>;
		readResults: Record<string, any>;
		extractResult: { nodes: any[]; edges: any[] };
	}>,
): GraphContext {
	const queryResults = overrides?.queryResults ?? {};
	const readResults = overrides?.readResults ?? {};
	const extractResult = overrides?.extractResult ?? { nodes: [], edges: [] };

	return {
		cosmos: {
			create: vi.fn().mockResolvedValue(undefined),
			read: vi
				.fn()
				.mockImplementation(async (_container: string, id: string) => {
					return readResults[id] ?? null;
				}),
			update: vi.fn().mockResolvedValue(undefined),
			query: vi
				.fn()
				.mockImplementation(async (_container: string, opts: any) => {
					// Return matching results based on query container
					for (const [key, val] of Object.entries(queryResults)) {
						if (opts.query?.includes(key)) return val;
					}
					return [];
				}),
		} as any,
		openai: {
			extractGraphEntities: vi.fn().mockResolvedValue(extractResult),
		} as any,
		blobStorage: {
			writeAuditEntry: vi.fn().mockResolvedValue(undefined),
		} as any,
	};
}

describe("createGraphNode", () => {
	it("creates a node with generated id and tenant", async () => {
		const ctx = createMockCtx();
		const node = await createGraphNode(
			"t1",
			{
				type: "file",
				name: "/src/main.ts",
				properties: {},
				sourceObservationIds: ["obs-1"],
			},
			ctx,
		);

		expect(node.id).toBeDefined();
		expect(node.tenantId).toBe("t1");
		expect(node.type).toBe("file");
		expect(node.name).toBe("/src/main.ts");
		expect(node.createdAt).toBeDefined();
		expect(ctx.cosmos.create).toHaveBeenCalledWith("graph-nodes", node);
	});
});

describe("createGraphEdge", () => {
	it("creates an edge with generated id and tenant", async () => {
		const ctx = createMockCtx();
		const edge = await createGraphEdge(
			"t1",
			{
				type: "uses",
				sourceNodeId: "node-1",
				targetNodeId: "node-2",
				weight: 1.0,
				sourceObservationIds: ["obs-1"],
			},
			ctx,
		);

		expect(edge.id).toBeDefined();
		expect(edge.tenantId).toBe("t1");
		expect(edge.type).toBe("uses");
		expect(edge.sourceNodeId).toBe("node-1");
		expect(edge.targetNodeId).toBe("node-2");
		expect(ctx.cosmos.create).toHaveBeenCalledWith("graph-edges", edge);
	});
});

describe("extractEntities", () => {
	it("creates nodes and edges from LLM extraction", async () => {
		const ctx = createMockCtx({
			extractResult: {
				nodes: [
					{ type: "file", name: "/src/main.ts" },
					{ type: "library", name: "express" },
				],
				edges: [{ type: "uses", source: "/src/main.ts", target: "express" }],
			},
		});

		const result = await extractEntities("t1", "test text", "obs-1", ctx);

		expect(result.nodes).toHaveLength(2);
		expect(result.edges).toHaveLength(1);
		expect(result.nodes[0].name).toBe("/src/main.ts");
		expect(result.nodes[1].name).toBe("express");
		expect(result.edges[0].type).toBe("uses");
		expect(ctx.cosmos.create).toHaveBeenCalledTimes(3); // 2 nodes + 1 edge
	});

	it("deduplicates existing nodes by merging sourceObservationIds", async () => {
		const existingNode = {
			id: "existing-node-1",
			tenantId: "t1",
			type: "file",
			name: "/src/main.ts",
			properties: {},
			sourceObservationIds: ["obs-old"],
			createdAt: "2024-01-01T00:00:00Z",
		};

		const ctx = createMockCtx({
			extractResult: {
				nodes: [{ type: "file", name: "/src/main.ts" }],
				edges: [],
			},
			queryResults: {
				"c.name = @name": [existingNode],
			},
		});

		const result = await extractEntities("t1", "test text", "obs-new", ctx);

		expect(result.nodes).toHaveLength(1);
		expect(result.nodes[0].id).toBe("existing-node-1");
		expect(result.nodes[0].sourceObservationIds).toContain("obs-old");
		expect(result.nodes[0].sourceObservationIds).toContain("obs-new");
		expect(ctx.cosmos.update).toHaveBeenCalledOnce();
		// Should NOT create a new node
		expect(ctx.cosmos.create).not.toHaveBeenCalled();
	});

	it("deduplicates existing edges by incrementing weight", async () => {
		const existingEdge = {
			id: "existing-edge-1",
			tenantId: "t1",
			type: "uses",
			sourceNodeId: "node-1",
			targetNodeId: "node-2",
			weight: 2.0,
			sourceObservationIds: ["obs-old"],
			createdAt: "2024-01-01T00:00:00Z",
		};

		const ctx = createMockCtx({
			extractResult: {
				nodes: [
					{ type: "file", name: "/src/main.ts" },
					{ type: "library", name: "express" },
				],
				edges: [{ type: "uses", source: "/src/main.ts", target: "express" }],
			},
			queryResults: {
				"c.sourceNodeId": [existingEdge],
			},
		});

		const result = await extractEntities("t1", "test text", "obs-new", ctx);

		expect(result.edges).toHaveLength(1);
		expect(result.edges[0].id).toBe("existing-edge-1");
		expect(result.edges[0].weight).toBe(2.5); // incremented by 0.5
		expect(result.edges[0].sourceObservationIds).toContain("obs-new");
	});

	it("handles empty LLM extraction gracefully", async () => {
		const ctx = createMockCtx({
			extractResult: { nodes: [], edges: [] },
		});

		const result = await extractEntities("t1", "test text", "obs-1", ctx);

		expect(result.nodes).toHaveLength(0);
		expect(result.edges).toHaveLength(0);
		expect(ctx.cosmos.create).not.toHaveBeenCalled();
	});

	it("skips edges when source or target node is missing", async () => {
		const ctx = createMockCtx({
			extractResult: {
				nodes: [{ type: "file", name: "/src/main.ts" }],
				edges: [
					{ type: "uses", source: "/src/main.ts", target: "nonexistent" },
				],
			},
		});

		const result = await extractEntities("t1", "test text", "obs-1", ctx);

		expect(result.nodes).toHaveLength(1);
		expect(result.edges).toHaveLength(0);
	});
});

describe("traverseGraph", () => {
	it("returns nodes and edges in outbound traversal", async () => {
		const node1 = {
			id: "n1",
			tenantId: "t1",
			type: "file",
			name: "main.ts",
			properties: {},
			sourceObservationIds: [],
			createdAt: "2024-01-01",
		};
		const node2 = {
			id: "n2",
			tenantId: "t1",
			type: "library",
			name: "express",
			properties: {},
			sourceObservationIds: [],
			createdAt: "2024-01-01",
		};
		const edge = {
			id: "e1",
			tenantId: "t1",
			type: "uses",
			sourceNodeId: "n1",
			targetNodeId: "n2",
			weight: 1,
			sourceObservationIds: [],
			createdAt: "2024-01-01",
		};

		const ctx = createMockCtx({
			readResults: { n1: node1, n2: node2 },
			queryResults: { "c.sourceNodeId = @nodeId": [edge] },
		});
		// Override query to return empty for n2's outbound edges
		(ctx.cosmos.query as any).mockImplementation(
			async (_: string, opts: any) => {
				const params = opts.parameters;
				const nodeId = params?.find((p: any) => p.name === "@nodeId")?.value;
				if (nodeId === "n1") return [edge];
				return [];
			},
		);

		const result = await traverseGraph(
			"t1",
			"n1",
			{ direction: "outbound", maxDepth: 2 },
			ctx,
		);

		expect(result.nodes).toHaveLength(2);
		expect(result.edges).toHaveLength(1);
		expect(result.nodes.map((n) => n.id)).toContain("n1");
		expect(result.nodes.map((n) => n.id)).toContain("n2");
	});

	it("respects maxDepth limit", async () => {
		const node1 = {
			id: "n1",
			tenantId: "t1",
			type: "file",
			name: "a.ts",
			properties: {},
			sourceObservationIds: [],
			createdAt: "2024-01-01",
		};

		const ctx = createMockCtx({ readResults: { n1: node1 } });
		(ctx.cosmos.query as any).mockResolvedValue([]);

		const result = await traverseGraph("t1", "n1", { maxDepth: 0 }, ctx);

		expect(result.nodes).toHaveLength(1);
		expect(result.edges).toHaveLength(0);
	});

	it("returns empty when start node not found", async () => {
		const ctx = createMockCtx();

		const result = await traverseGraph("t1", "missing", {}, ctx);

		expect(result.nodes).toHaveLength(0);
		expect(result.edges).toHaveLength(0);
	});
});
