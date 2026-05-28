import { describe, expect, it, vi } from "vitest";
import { captureObservation } from "../../engine/observe.js";
import type { ObserveContext } from "../../engine/observe.js";
import type { RawObservation } from "../../types/models.js";

function createRaw(overrides?: Partial<RawObservation>): RawObservation {
	return {
		id: "obs-1",
		tenantId: "tenant-1",
		sessionId: "session-1",
		timestamp: "2024-01-01T00:00:00Z",
		hookType: "post_tool_use",
		toolName: "Read",
		toolInput: { filePath: "src/index.ts" },
		toolOutput: "file content",
		raw: { original: true },
		...overrides,
	};
}

type MockObserveContext = ObserveContext & {
	cosmos: ObserveContext["cosmos"] & {
		create: ReturnType<typeof vi.fn>;
		read: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		query: ReturnType<typeof vi.fn>;
	};
	openai: ObserveContext["openai"] & {
		compress: ReturnType<typeof vi.fn>;
		embed: ReturnType<typeof vi.fn>;
		extractGraphEntities: ReturnType<typeof vi.fn>;
	};
	search: ObserveContext["search"] & {
		indexDocument: ReturnType<typeof vi.fn>;
	};
	blobStorage: ObserveContext["blobStorage"] & {
		writeRawObservation: ReturnType<typeof vi.fn>;
		writeAuditEntry: ReturnType<typeof vi.fn>;
	};
};

function createCtx(
	session: Record<string, unknown> | null = {
		id: "session-1",
		tenantId: "tenant-1",
		observationCount: 2,
	},
): MockObserveContext {
	return {
		cosmos: {
			create: vi.fn().mockResolvedValue(undefined),
			read: vi.fn().mockResolvedValue(session),
			update: vi.fn().mockResolvedValue(undefined),
			query: vi.fn().mockResolvedValue([]),
		},
		openai: {
			compress: vi.fn().mockResolvedValue(
				JSON.stringify({
					title: "Read index.ts",
					narrative: "The agent read the service entry point.",
					facts: ["Entry point uses Fastify"],
					concepts: ["fastify", "entrypoint"],
					files: ["src/index.ts"],
					importance: 7,
					type: "file_read",
				}),
			),
			embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
			extractGraphEntities: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
		},
		search: {
			indexDocument: vi.fn().mockResolvedValue(undefined),
		},
		blobStorage: {
			writeRawObservation: vi.fn().mockResolvedValue(undefined),
			writeAuditEntry: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as MockObserveContext;
}

describe("captureObservation", () => {
	it("archives, compresses, embeds, stores, indexes, updates session, and audits", async () => {
		const raw = createRaw();
		const ctx = createCtx();

		const observation = await captureObservation(raw, ctx);

		expect(ctx.blobStorage.writeRawObservation).toHaveBeenCalledWith(
			"tenant-1",
			"session-1",
			"obs-1",
			raw,
		);
		expect(ctx.openai.embed).toHaveBeenCalledWith(
			"Read index.ts. The agent read the service entry point. fastify, entrypoint",
		);
		expect(ctx.cosmos.create).toHaveBeenCalledWith(
			"observations",
			expect.objectContaining({ id: "obs-1", embedding: [0.1, 0.2, 0.3] }),
		);
		expect(ctx.search.indexDocument).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "obs-1",
				tenantId: "tenant-1",
				docType: "observation",
				content: "The agent read the service entry point.",
				embedding: [0.1, 0.2, 0.3],
			}),
		);
		expect(ctx.cosmos.update).toHaveBeenCalledWith(
			"sessions",
			expect.objectContaining({ observationCount: 3 }),
		);
		expect(ctx.blobStorage.writeAuditEntry).toHaveBeenCalledWith(
			"tenant-1",
			expect.objectContaining({ operation: "observe", targetIds: ["obs-1"] }),
		);
		expect(observation.content).toBe("The agent read the service entry point.");
	});

	it("does not update a missing session", async () => {
		const ctx = createCtx(null);

		await captureObservation(createRaw(), ctx);

		expect(ctx.cosmos.update).not.toHaveBeenCalled();
	});

	it("does not fail capture when best-effort graph extraction rejects", async () => {
		const ctx = createCtx();
		ctx.openai.extractGraphEntities.mockRejectedValueOnce(
			new Error("graph unavailable"),
		);

		await expect(captureObservation(createRaw(), ctx)).resolves.toEqual(
			expect.objectContaining({ id: "obs-1" }),
		);
	});
});
