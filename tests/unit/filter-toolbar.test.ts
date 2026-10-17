import { expect, it } from "vitest";
import {
  activeToolbarFilters,
  clearToolbarFilters,
  toolbarUrl,
  validateToolbarValues,
  toolbarChoice,
  type FilterConfig,
} from "../../src/lib/filter-toolbar";
const config: FilterConfig = {
  label: "Projects",
  search: { key: "q", placeholder: "Search projects" },
  sort: {
    key: "sort",
    defaultValue: "newest",
    options: [{ value: "name", label: "Name" }],
  },
  fields: [
    {
      key: "stage",
      label: "Stage",
      options: [
        { value: "", label: "All" },
        { value: "Closed", label: "Closed" },
      ],
    },
    {
      key: "by",
      label: "Search by",
      defaultValue: "name",
      options: [
        { value: "name", label: "Name" },
        { value: "reference", label: "Reference" },
      ],
    },
  ],
};
it("counts simultaneous applied filters, excluding search and sort", () => {
  expect(
    activeToolbarFilters(config, {
      q: "Kitchen",
      sort: "name",
      stage: "Closed",
      by: "reference",
    }).map((f) => f.key),
  ).toEqual(["stage", "by"]);
  expect(
    activeToolbarFilters(config, {
      q: "Kitchen",
      sort: "name",
      stage: "",
      by: "name",
    }),
  ).toHaveLength(0);
});
it("chip removal and Clear All preserve search and sort", () => {
  const values = {
    q: "Kitchen",
    sort: "name",
    stage: "Closed",
    by: "reference",
  };
  expect(clearToolbarFilters(config, values, "stage")).toEqual({
    ...values,
    stage: "",
  });
  expect(clearToolbarFilters(config, values)).toEqual({
    ...values,
    stage: "",
    by: "name",
  });
});
it("URL changes reset pagination, retain tabs/view and encode literal search text", () => {
  const url = new URL(
    toolbarUrl(
      "/dashboard/projects",
      "?page=4&offset=100&view=list&tab=spaces&stage=Closed",
      config,
      { q: "A&B + room", stage: "", sort: "name" },
    ),
    "https://example.test",
  );
  expect(Object.fromEntries(url.searchParams)).toEqual({
    view: "list",
    tab: "spaces",
    q: "A&B + room",
    sort: "name",
  });
});
it("keeps explicit All defaults instead of restoring an implicit status filter", () => {
  const lead = {
    ...config,
    fields: [{ key: "status", label: "Status", defaultValue: "All" }],
  };
  expect(
    toolbarUrl(
      "/dashboard/leads",
      "?status=Submitted&page=3",
      lead,
      clearToolbarFilters(lead, { status: "Submitted", q: "Room" }),
    ),
  ).toContain("status=All");
});
it("rejects impossible dates and unsupported selections; bounds URL choices", () => {
  expect(
    validateToolbarValues(
      {
        ...config,
        fields: [
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
        ],
      },
      { from: "2025-02-30", to: "2025-01-01" },
    ),
  ).toMatchObject({ from: expect.any(String), to: expect.any(String) });
  expect(
    validateToolbarValues(config, { stage: "Injected", by: "name" }).stage,
  ).toBeDefined();
  expect(toolbarChoice({ status: "Injected" }, "status", ["Closed"])).toBe("");
});
