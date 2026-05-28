import { describe, expect, it, vi } from "vitest";
import { forgetMemory } from "../../engine/forget.js";
import type { ForgetContext } from "../../engine/forget.js";
import type { Memory } from "../../types/models.js";

function createMemory(): Memory {
	return {
		id: "mem-1",
		tenantId: "tenant-1",
		createdAt: "2024-01-01T00:00:00Z",
		updatedAt: "2024-01-01T00:00:00Z",
		type: "fact",
		title: "Remember this",
		content: "Important content",
		concepts: [],
		files: [],
		sessionIds: [],
		strength: 1,
		version: 1,
		isLatest: true,
	};
}

type MockForgetContext = ForgetContext & {
	cosmos: ForgetContext["cosmos"] & {
		read: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
	};
	search: ForgetContext["search"] & {
		deleteDocument: ReturnType<typeof vi.fn>;
	};
	blobStorage: ForgetContext["blobStorage"] & {
		writeAuditEntry: ReturnType<typeof vi.fn>;
	};
};

function createCtx(memory: Memory | null = createMemory()): MockForgetContext {
	return {
		cosmos: {
			read: vi.fn().mockResolvedValue(memory),
			update: vi.fn().mockResolvedValue(undefined),
		},
		search: {
			deleteDocument: vi.fn().mockResolvedValue(undefined),
		},
		blobStorage: {
			writeAuditEntry: vi.fn().mockResolvedValue(undefined),
		},
	} as unknown as MockForgetContext;
}

describe("forgetMemory", () => {
	it("soft deletes a memory and removes it from search", async () => {
		const memory = createMemory();
		const ctx = createCtx(memory);

		await forgetMemory("tenant-1", "mem-1", ctx);

		expect(ctx.cosmos.update).toHaveBeenCalledWith(
			"memories",
			expect.objectContaining({
				id: "mem-1",
				isLatest: false,
				strength: 0,
				updatedAt: expect.any(String),
			}),
		);
		expect(ctx.search.deleteDocument).toHaveBeenCalledWith("mem-1");
	});

	it("writes a forget audit entry", async () => {
		const ctx = createCtx();

		await forgetMemory("tenant-1", "mem-1", ctx);

		expect(ctx.blobStorage.writeAuditEntry).toHaveBeenCalledWith(
			"tenant-1",
			expect.objectContaining({
				operation: "forget",
				functionId: "forgetMemory",
				targetIds: ["mem-1"],
				details: { title: "Remember this" },
			}),
		);
	});

	it("throws when the memory does not exist", async () => {
		const ctx = createCtx(null);

		await expect(forgetMemory("tenant-1", "missing", ctx)).rejects.toThrow(
			"Memory missing not found",
		);
		expect(ctx.search.deleteDocument).not.toHaveBeenCalled();
	});
});
