import { expect, it } from "vitest";
import {
  designerOptions,
  orderedOperations,
} from "../../src/lib/project-team-editor";
import type { Person } from "../../src/lib/phase1";
it("preserves primary Operations ordering required by the existing RPC and deduplicates members", () => {
  expect(orderedOperations(["a", "b", "b"], "b")).toEqual(["b", "a"]);
  expect(orderedOperations([], "removed")).toEqual([]);
});
it("restricts designer options to existing eligible roles and excludes the primary from support", () => {
  const people = [
    { id: "d", role: "designer" },
    { id: "l", role: "lead_designer" },
    { id: "o", role: "operations_admin" },
    { id: "b", role: "bdm" },
  ] as Person[];
  expect(designerOptions(people, "d").map((p) => p.id)).toEqual(["l"]);
});
