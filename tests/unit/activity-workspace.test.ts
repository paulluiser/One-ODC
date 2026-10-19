import { expect, it } from "vitest";
import {
  activityDirectory,
  readableChanges,
  type ActivityRow,
} from "../../src/lib/activity-workspace";
const event = (n: number): ActivityRow => ({
  id: `event-${n}`,
  title: `Update ${n}`,
  category: n % 2 ? "Financial" : "System Event",
  description: `Description ${n}`,
  actor: "Alex",
  at: `2026-10-${String((n % 20) + 1).padStart(2, "0")}T10:00:00Z`,
  date: `2026-10-${String((n % 20) + 1).padStart(2, "0")}`,
  space: null,
  related: "Project",
  reason: "Saved",
  changes: [],
  links: [],
});
it("deduplicates by stable identity and filters before 50-row pagination, including older matches", () => {
  const data = Array.from({ length: 121 }, (_, i) => event(i));
  expect(activityDirectory([...data, data[0]], {}).count).toBe(121);
  const second = activityDirectory(data, { offset: "50" });
  expect(second.rows).toHaveLength(50);
  expect(second.offset).toBe(50);
  expect(
    activityDirectory(data, { activity_q: "Update 120", offset: "100" }).rows[0]
      .id,
  ).toBe("event-120");
  expect(activityDirectory(data, { category: "Financial" }).all).toHaveLength(
    121,
  );
  expect(activityDirectory(data, { category: "Financial" }).count).toBe(60);
});
it("validates dates and keeps sort deterministic across equal timestamps", () => {
  const data = [event(1), event(2)];
  expect(
    activityDirectory(data, { from: "2026-10-05", to: "2026-10-01" }).error,
  ).not.toBe("");
  expect(activityDirectory(data, { from: "2026-02-30" }).error).not.toBe("");
  expect(activityDirectory(data, { activity_sort: "oldest" }).rows[0].id).toBe(
    "event-1",
  );
  expect(activityDirectory(data, { actor: "Unknown" }).count).toBe(0);
});
it("renders allowlisted changes and exact money without exposing internal identifiers or metadata", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const result = readableChanges(
    { amount: "0.10", primary_designer_id: null },
    {
      amount: "9999999999999999.99",
      primary_designer_id: id,
      private_notes: "restricted",
      actor_id: id,
    },
    { [id]: "Alex" },
  );
  expect(JSON.stringify(result)).toContain("₱9,999,999,999,999,999.99");
  expect(JSON.stringify(result)).toContain("Alex");
  expect(JSON.stringify(result)).not.toContain(id);
  expect(JSON.stringify(result)).not.toContain("restricted");
});
