import { describe, expect, it } from "vitest";
import { evolveMemory as reExportedEvolveMemory } from "../../engine/evolve.js";
import { evolveMemory } from "../../engine/remember.js";

describe("evolve module", () => {
	it("re-exports evolveMemory from remember engine", () => {
		expect(reExportedEvolveMemory).toBe(evolveMemory);
	});
});
