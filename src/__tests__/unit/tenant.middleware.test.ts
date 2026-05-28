import { describe, expect, it, vi } from "vitest";
import { tenantMiddleware } from "../../middleware/tenant.middleware.js";

interface TestTenantRequest {
	user?: { tenantId?: string };
	tenantId?: string;
}

function makeReply() {
	const reply = {
		sent: false,
		statusCode: 200,
		payload: undefined as unknown,
		code: vi.fn((status: number) => {
			reply.statusCode = status;
			return reply;
		}),
		send: vi.fn((payload: unknown) => {
			reply.sent = true;
			reply.payload = payload;
			return reply;
		}),
	};
	return reply;
}

function asTenantRequest(request: TestTenantRequest) {
	return request as unknown as Parameters<typeof tenantMiddleware>[0];
}

function asTenantReply(reply: ReturnType<typeof makeReply>) {
	return reply as unknown as Parameters<typeof tenantMiddleware>[1];
}

describe("tenantMiddleware", () => {
	it("copies tenantId from authenticated user to request context", async () => {
		const request: TestTenantRequest = { user: { tenantId: "tenant-1" } };
		const reply = makeReply();

		await tenantMiddleware(asTenantRequest(request), asTenantReply(reply));

		expect(request.tenantId).toBe("tenant-1");
		expect(reply.send).not.toHaveBeenCalled();
	});

	it("returns 403 when no tenant context is available", async () => {
		const request: TestTenantRequest = { user: {} };
		const reply = makeReply();

		await tenantMiddleware(asTenantRequest(request), asTenantReply(reply));

		expect(reply.statusCode).toBe(403);
		expect(reply.payload).toEqual({
			error: {
				code: "MISSING_TENANT",
				message: "No tenant context",
				status: 403,
			},
		});
	});
});
