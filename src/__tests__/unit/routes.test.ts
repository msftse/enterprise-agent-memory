import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AISearchAdapter } from "../../adapters/ai-search.adapter.js";
import type { AzureOpenAIAdapter } from "../../adapters/azure-openai.adapter.js";
import type { BlobStorageAdapter } from "../../adapters/blob-storage.adapter.js";
import type { CosmosAdapter } from "../../adapters/cosmos.adapter.js";
import { registerAdminRoutes } from "../../routes/admin.routes.js";
import { registerGraphRoutes } from "../../routes/graph.routes.js";
import { registerMemoryRoutes } from "../../routes/memories.routes.js";
import { registerObservationRoutes } from "../../routes/observations.routes.js";
import { registerSessionRoutes } from "../../routes/sessions.routes.js";
import { registerViewerRoutes } from "../../routes/viewer.routes.js";
import type {
	GraphEdge,
	GraphNode,
	Memory,
	Session,
} from "../../types/models.js";

type MockCosmos = CosmosAdapter & {
	create: ReturnType<typeof vi.fn>;
	read: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	query: ReturnType<typeof vi.fn>;
	purgeContainer: ReturnType<typeof vi.fn>;
	healthCheck: ReturnType<typeof vi.fn>;
};

type MockOpenAI = AzureOpenAIAdapter & {
	embed: ReturnType<typeof vi.fn>;
	compress: ReturnType<typeof vi.fn>;
	extractGraphEntities: ReturnType<typeof vi.fn>;
};

type MockSearch = AISearchAdapter & {
	indexDocument: ReturnType<typeof vi.fn>;
	deleteDocument: ReturnType<typeof vi.fn>;
	purgeTenant: ReturnType<typeof vi.fn>;
	healthCheck: ReturnType<typeof vi.fn>;
};

type MockBlob = BlobStorageAdapter & {
	writeRawObservation: ReturnType<typeof vi.fn>;
	writeAuditEntry: ReturnType<typeof vi.fn>;
	purgeTenant: ReturnType<typeof vi.fn>;
	healthCheck: ReturnType<typeof vi.fn>;
};

function createApp() {
	const app = Fastify({ logger: false });
	app.addHook("onRequest", async (request) => {
		request.tenantId = "tenant-1";
		request.user = { sub: "user-1", tenantId: "tenant-1", roles: ["admin"] };
	});
	return app;
}

function createCosmos(): MockCosmos {
	return {
		create: vi.fn().mockResolvedValue(undefined),
		read: vi.fn().mockResolvedValue(null),
		update: vi.fn().mockResolvedValue(undefined),
		query: vi.fn().mockResolvedValue([]),
		purgeContainer: vi.fn().mockResolvedValue(0),
		healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
	} as unknown as MockCosmos;
}

function createOpenAI(): MockOpenAI {
	return {
		embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
		compress: vi.fn().mockResolvedValue(
			JSON.stringify({
				title: "Compressed",
				narrative: "Compressed content",
				facts: [],
				concepts: [],
				files: [],
				importance: 5,
				type: "other",
			}),
		),
		extractGraphEntities: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
	} as unknown as MockOpenAI;
}

function createSearch(): MockSearch {
	return {
		indexDocument: vi.fn().mockResolvedValue(undefined),
		deleteDocument: vi.fn().mockResolvedValue(undefined),
		purgeTenant: vi.fn().mockResolvedValue(0),
		healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
	} as unknown as MockSearch;
}

function createBlob(): MockBlob {
	return {
		writeRawObservation: vi.fn().mockResolvedValue(undefined),
		writeAuditEntry: vi.fn().mockResolvedValue(undefined),
		purgeTenant: vi.fn().mockResolvedValue({ auditDeleted: 0, rawDeleted: 0 }),
		healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
	} as unknown as MockBlob;
}

async function withApp(
	register: (app: ReturnType<typeof createApp>) => void | Promise<void>,
	run: (app: ReturnType<typeof createApp>) => Promise<void>,
) {
	const app = createApp();
	await register(app);
	await app.ready();
	try {
		await run(app);
	} finally {
		await app.close();
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("viewer routes", () => {
	it("serves the embedded viewer and redirects root through /viewer", async () => {
		await withApp(
			(app) => registerViewerRoutes(app),
			async (app) => {
				const viewer = await app.inject({ method: "GET", url: "/viewer" });
				const viewerIndex = await app.inject({ method: "GET", url: "/viewer/" });
				const root = await app.inject({ method: "GET", url: "/" });

				expect(viewer.statusCode).toBe(302);
				expect(viewer.headers.location).toBe("/viewer/");
				expect(viewerIndex.statusCode).toBe(200);
				expect(viewerIndex.headers["content-type"]).toContain("text/html");
				expect(viewerIndex.payload).toContain("<!doctype html>");
				expect(root.statusCode).toBe(302);
				expect(root.headers.location).toBe("/viewer");
			},
		);
	});
});

describe("session routes", () => {
	it("lists sessions with project and status filters", async () => {
		const cosmos = createCosmos();
		const session: Session = {
			id: "session-1",
			tenantId: "tenant-1",
			project: "proj",
			cwd: "/repo",
			startedAt: "2024-01-01T00:00:00Z",
			status: "active",
			observationCount: 0,
		};
		cosmos.query.mockResolvedValueOnce([session]).mockResolvedValueOnce([1]);

		await withApp(
			(app) => registerSessionRoutes(app, cosmos),
			async (app) => {
				const response = await app.inject({
					method: "GET",
					url: "/api/v1/sessions?project=proj&status=active&offset=1&limit=2",
				});

				expect(response.statusCode).toBe(200);
				expect(cosmos.query.mock.calls[0][1]).toEqual(
					expect.objectContaining({
						query: expect.stringContaining("c.project = @project"),
						parameters: expect.arrayContaining([
							{ name: "@tenantId", value: "tenant-1" },
							{ name: "@offset", value: 1 },
							{ name: "@limit", value: 2 },
							{ name: "@project", value: "proj" },
							{ name: "@status", value: "active" },
						]),
					}),
				);
				expect(JSON.parse(response.payload).data).toEqual(
					expect.objectContaining({ total: 1, offset: "1", limit: "2" }),
				);
			},
		);
	});

	it("patches and ends sessions", async () => {
		const cosmos = createCosmos();
		const session: Session = {
			id: "session-1",
			tenantId: "tenant-1",
			project: "proj",
			cwd: "/repo",
			startedAt: "2024-01-01T00:00:00Z",
			status: "active",
			observationCount: 0,
		};
		cosmos.read.mockResolvedValue({ ...session });

		await withApp(
			(app) => registerSessionRoutes(app, cosmos),
			async (app) => {
				const patch = await app.inject({
					method: "PATCH",
					url: "/api/v1/sessions/session-1",
					payload: { status: "abandoned", tags: ["debug"], summary: "stopped" },
				});

				expect(patch.statusCode).toBe(200);
				expect(JSON.parse(patch.payload).data).toEqual(
					expect.objectContaining({
						status: "abandoned",
						tags: ["debug"],
						summary: "stopped",
					}),
				);

				const end = await app.inject({
					method: "POST",
					url: "/api/v1/sessions/session-1/end",
				});

				expect(end.statusCode).toBe(200);
				expect(cosmos.update).toHaveBeenCalledWith(
					"sessions",
					expect.objectContaining({
						status: "completed",
						endedAt: expect.any(String),
					}),
				);
			},
		);
	});
});

describe("observation routes", () => {
	it("normalizes legacy observations and lists observations by session", async () => {
		const cosmos = createCosmos();
		const legacyObservation = {
			id: "obs-1",
			tenantId: "tenant-1",
			sessionId: "session-1",
			timestamp: "2024-01-01T00:00:00Z",
			type: "other",
			title: "Legacy",
			facts: [],
			narrative: "legacy narrative",
			concepts: [],
			files: [],
			importance: 5,
		};
		cosmos.read.mockResolvedValueOnce({ ...legacyObservation });
		cosmos.query.mockResolvedValueOnce([{ ...legacyObservation }]);

		await withApp(
			(app) =>
				registerObservationRoutes(
					app,
					cosmos,
					createOpenAI(),
					createSearch(),
					createBlob(),
				),
			async (app) => {
				const get = await app.inject({
					method: "GET",
					url: "/api/v1/observations/obs-1",
				});
				const list = await app.inject({
					method: "GET",
					url: "/api/v1/sessions/session-1/observations?offset=2&limit=3",
				});

				expect(JSON.parse(get.payload).data.content).toBe("legacy narrative");
				expect(JSON.parse(list.payload).data.items[0].content).toBe(
					"legacy narrative",
				);
				expect(cosmos.query).toHaveBeenCalledWith(
					"observations",
					expect.objectContaining({
						parameters: expect.arrayContaining([
							{ name: "@sessionId", value: "session-1" },
							{ name: "@offset", value: 2 },
							{ name: "@limit", value: 3 },
						]),
					}),
				);
			},
		);
	});

	it("returns 404 for missing observations", async () => {
		const cosmos = createCosmos();

		await withApp(
			(app) =>
				registerObservationRoutes(
					app,
					cosmos,
					createOpenAI(),
					createSearch(),
					createBlob(),
				),
			async (app) => {
				const response = await app.inject({
					method: "GET",
					url: "/api/v1/observations/missing",
				});

				expect(response.statusCode).toBe(404);
				expect(JSON.parse(response.payload).error.code).toBe("NOT_FOUND");
			},
		);
	});
});

describe("memory routes", () => {
	function memory(overrides?: Partial<Memory>): Memory {
		return {
			id: "mem-1",
			tenantId: "tenant-1",
			createdAt: "2024-01-01T00:00:00Z",
			updatedAt: "2024-01-01T00:00:00Z",
			type: "fact",
			title: "Fact",
			content: "Content",
			concepts: [],
			files: [],
			sessionIds: [],
			strength: 1,
			version: 1,
			isLatest: true,
			...overrides,
		};
	}

	it("lists latest and forgotten memories", async () => {
		const cosmos = createCosmos();
		cosmos.query
			.mockResolvedValueOnce([memory()])
			.mockResolvedValueOnce([1])
			.mockResolvedValueOnce([memory({ strength: 0, isLatest: false })])
			.mockResolvedValueOnce([1]);

		await withApp(
			(app) =>
				registerMemoryRoutes(
					app,
					cosmos,
					createOpenAI(),
					createSearch(),
					createBlob(),
				),
			async (app) => {
				await app.inject({
					method: "GET",
					url: "/api/v1/memories?project=proj",
				});
				await app.inject({
					method: "GET",
					url: "/api/v1/memories?status=forgotten",
				});

				expect(cosmos.query.mock.calls[0][1].query).toContain(
					"c.isLatest = true",
				);
				expect(cosmos.query.mock.calls[0][1].query).toContain(
					"c.project = @project",
				);
				expect(cosmos.query.mock.calls[2][1].query).toContain("c.strength = 0");
			},
		);
	});

	it("returns memory version chains", async () => {
		const cosmos = createCosmos();
		cosmos.read
			.mockResolvedValueOnce(
				memory({ id: "mem-2", version: 2, parentId: "mem-1" }),
			)
			.mockResolvedValueOnce(memory({ id: "mem-1", version: 1 }));
		cosmos.query.mockResolvedValueOnce([
			memory({ id: "mem-2", version: 2, parentId: "mem-1" }),
			memory({ id: "mem-1", version: 1 }),
		]);

		await withApp(
			(app) =>
				registerMemoryRoutes(
					app,
					cosmos,
					createOpenAI(),
					createSearch(),
					createBlob(),
				),
			async (app) => {
				const response = await app.inject({
					method: "GET",
					url: "/api/v1/memories/mem-2/versions",
				});

				expect(response.statusCode).toBe(200);
				expect(cosmos.query).toHaveBeenCalledWith(
					"memories",
					expect.objectContaining({
						parameters: expect.arrayContaining([
							{ name: "@rootId", value: "mem-1" },
						]),
					}),
				);
				expect(JSON.parse(response.payload).data).toHaveLength(2);
			},
		);
	});

	it("evolves and deletes memories through routes", async () => {
		const cosmos = createCosmos();
		cosmos.read.mockResolvedValue(memory());
		const search = createSearch();

		await withApp(
			(app) =>
				registerMemoryRoutes(app, cosmos, createOpenAI(), search, createBlob()),
			async (app) => {
				const evolve = await app.inject({
					method: "PUT",
					url: "/api/v1/memories/mem-1/evolve",
					payload: { content: "Updated content" },
				});
				const remove = await app.inject({
					method: "DELETE",
					url: "/api/v1/memories/mem-1",
				});

				expect(evolve.statusCode).toBe(200);
				expect(JSON.parse(evolve.payload).data).toEqual(
					expect.objectContaining({ version: 2 }),
				);
				expect(remove.statusCode).toBe(200);
				expect(JSON.parse(remove.payload).data).toEqual({
					id: "mem-1",
					forgotten: true,
				});
				expect(search.deleteDocument).toHaveBeenCalledWith("mem-1");
			},
		);
	});
});

describe("graph routes", () => {
	it("creates, lists, and reads graph nodes and edges", async () => {
		const cosmos = createCosmos();
		const node: GraphNode = {
			id: "node-1",
			tenantId: "tenant-1",
			type: "file",
			name: "src/index.ts",
			properties: {},
			sourceObservationIds: [],
			createdAt: "2024-01-01T00:00:00Z",
		};
		const edge: GraphEdge = {
			id: "edge-1",
			tenantId: "tenant-1",
			type: "uses",
			sourceNodeId: "node-1",
			targetNodeId: "node-2",
			weight: 1,
			sourceObservationIds: [],
			createdAt: "2024-01-01T00:00:00Z",
		};
		cosmos.query.mockResolvedValueOnce([node]).mockResolvedValueOnce([edge]);
		cosmos.read.mockResolvedValueOnce(node).mockResolvedValueOnce(edge);

		await withApp(
			(app) => registerGraphRoutes(app, cosmos, createOpenAI(), createBlob()),
			async (app) => {
				const createNode = await app.inject({
					method: "POST",
					url: "/api/v1/graph/nodes",
					payload: {
						type: "file",
						name: "src/index.ts",
						properties: {},
						sourceObservationIds: [],
					},
				});
				const listNodes = await app.inject({
					method: "GET",
					url: "/api/v1/graph/nodes?type=file",
				});
				const getNode = await app.inject({
					method: "GET",
					url: "/api/v1/graph/nodes/node-1",
				});
				const createEdge = await app.inject({
					method: "POST",
					url: "/api/v1/graph/edges",
					payload: {
						type: "uses",
						sourceNodeId: "node-1",
						targetNodeId: "node-2",
						weight: 1,
						sourceObservationIds: [],
					},
				});
				const listEdges = await app.inject({
					method: "GET",
					url: "/api/v1/graph/edges?nodeId=node-1",
				});

				expect(createNode.statusCode).toBe(201);
				expect(listNodes.statusCode).toBe(200);
				expect(getNode.statusCode).toBe(200);
				expect(createEdge.statusCode).toBe(201);
				expect(listEdges.statusCode).toBe(200);
				expect(cosmos.query.mock.calls[0][1].query).toContain("c.type = @type");
				expect(cosmos.query.mock.calls[1][1].query).toContain(
					"c.sourceNodeId = @nodeId",
				);
			},
		);
	});

	it("traverses graph and extracts graph entities from observations", async () => {
		const cosmos = createCosmos();
		const startNode: GraphNode = {
			id: "node-1",
			tenantId: "tenant-1",
			type: "file",
			name: "src/index.ts",
			properties: {},
			sourceObservationIds: [],
			createdAt: "2024-01-01T00:00:00Z",
		};
		const observation = {
			id: "obs-1",
			tenantId: "tenant-1",
			sessionId: "session-1",
			timestamp: "2024-01-01T00:00:00Z",
			type: "other",
			title: "Observation",
			facts: [],
			content: "Uses Fastify",
			narrative: "Uses Fastify",
			concepts: ["fastify"],
			files: ["src/index.ts"],
			importance: 5,
		};
		cosmos.read
			.mockResolvedValueOnce(startNode)
			.mockResolvedValueOnce(observation);
		cosmos.query.mockResolvedValue([]);

		await withApp(
			(app) => registerGraphRoutes(app, cosmos, createOpenAI(), createBlob()),
			async (app) => {
				const traverse = await app.inject({
					method: "POST",
					url: "/api/v1/graph/traverse",
					payload: { startNodeId: "node-1", maxDepth: 1 },
				});
				const extract = await app.inject({
					method: "POST",
					url: "/api/v1/graph/extract",
					payload: { observationId: "obs-1" },
				});
				const batch = await app.inject({
					method: "POST",
					url: "/api/v1/graph/extract-batch",
					payload: { sessionId: "session-1" },
				});

				expect(traverse.statusCode).toBe(200);
				expect(JSON.parse(traverse.payload).data.nodes).toHaveLength(1);
				expect(extract.statusCode).toBe(201);
				expect(batch.statusCode).toBe(201);
			},
		);
	});
});

describe("admin routes", () => {
	it("returns metrics and purges tenant data", async () => {
		const cosmos = createCosmos();
		cosmos.query
			.mockResolvedValueOnce([2])
			.mockResolvedValueOnce([3])
			.mockResolvedValueOnce([4])
			.mockResolvedValueOnce([5]);
		cosmos.purgeContainer
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2)
			.mockResolvedValueOnce(3)
			.mockResolvedValueOnce(4)
			.mockResolvedValueOnce(5)
			.mockResolvedValueOnce(6);
		const search = createSearch();
		const blob = createBlob();

		await withApp(
			(app) => registerAdminRoutes(app, cosmos, search, blob),
			async (app) => {
				const metrics = await app.inject({
					method: "GET",
					url: "/api/v1/admin/metrics",
				});
				const purge = await app.inject({
					method: "DELETE",
					url: "/api/v1/admin/tenant-data",
				});

				expect(JSON.parse(metrics.payload).data).toEqual({
					tenantId: "tenant-1",
					sessions: 2,
					observations: 3,
					memories: 4,
					graphNodes: 5,
				});
				expect(JSON.parse(purge.payload).data.deletedCounts).toEqual({
					sessions: 1,
					observations: 2,
					memories: 3,
					graphNodes: 4,
					graphEdges: 5,
					auditEntries: 6,
				});
				expect(search.purgeTenant).toHaveBeenCalledWith("tenant-1");
				expect(blob.purgeTenant).toHaveBeenCalledWith("tenant-1");
			},
		);
	});
});
