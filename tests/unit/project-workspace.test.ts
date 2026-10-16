import { expect, it } from "vitest";
import {
  projectDirectoryOptions,
  projectDirectoryUrl,
  projectSearchPattern,
  projectSchema,
} from "../../src/lib/project-workspace";
it("normalizes untrusted filters to fixed columns, stages, sorting and bounded pages", () => {
  expect(
    projectDirectoryOptions({
      q: ["unsafe"],
      by: "profiles",
      stage: "Invented",
      sort: "raw_sql",
      page: "-99",
    }),
  ).toEqual({ q: "", searchBy: "name", stage: "", sort: "newest", page: 1 });
  expect(projectDirectoryOptions({ page: "Infinity" }).page).toBe(1);
  expect(projectDirectoryOptions({ page: "999999999999" }).page).toBe(100000);
  expect(
    projectDirectoryOptions({
      q: " x ",
      by: "reference",
      stage: "Closed",
      sort: "name",
      page: "2",
    }),
  ).toEqual({
    q: "x",
    searchBy: "reference",
    stage: "Closed",
    sort: "name",
    page: 2,
  });
});
it("pagination preserves filters and encodes literal search input", () => {
  const options = projectDirectoryOptions({
    q: "A & B %_",
    by: "reference",
    stage: "Under Negotiation",
    sort: "name",
  });
  const url = new URL(projectDirectoryUrl(options, 2), "http://localhost");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "A & B %_",
    by: "reference",
    stage: "Under Negotiation",
    sort: "name",
    page: "2",
  });
  expect(projectSearchPattern("50%_room\\plan")).toBe("%50\\%\\_room\\\\plan%");
});
it("validates actual status values instead of manufacturing lifecycle progress", () => {
  expect(
    projectSchema.safeParse({
      id: "10000000-0000-4000-8000-000000000001",
      reference: "ODC-1",
      name: "Home",
      lead_designer_id: "10000000-0000-4000-8000-000000000002",
      commercial_status: "For Quotation",
      expected_handoff: null,
      created_at: "2026-10-13",
    }).success,
  ).toBe(true);
  expect(
    projectSchema.safeParse({ commercial_status: "Completed" }).success,
  ).toBe(false);
});
