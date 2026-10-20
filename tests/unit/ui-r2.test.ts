import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/projects",
}));
import {
  Disclosure,
  Scope,
  SpaceRow,
} from "../../src/components/ui-r2/primitives";
import {
  LeadDirectory,
  ProjectDirectory,
} from "../../src/components/ui-r2/directories";
import { emptyLead, type Lead, type Project } from "../../src/lib/phase1";
import type { Monitoring } from "../../src/lib/monitoring";
import { projectDirectoryOptions } from "../../src/lib/project-workspace";
const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  reference: "ODC-042",
  name: "Kitchen <script>",
  lead_designer_id: "22222222-2222-4222-8222-222222222222",
  commercial_status: "Under Negotiation",
  expected_handoff: null,
  created_at: "2026-10-15T00:00:00Z",
};
const m = {
  project_id: project.id,
  active_spaces: 4,
  completed_spaces: 1,
  deadline: "2026-11-15",
  original_deadline: "2026-11-15",
  state: "Active",
  timezone: "Asia/Manila",
  last_progress_at: "2026-10-15T00:00:00Z",
  cycles: [],
  holds: [],
  space_refs: [],
} as unknown as Monitoring;
it("uses native disclosure semantics, Lucide chevron, escaped label and keyboard-compatible summary", () => {
  const html = renderToStaticMarkup(
    createElement(Scope, {
      children: createElement(Disclosure, {
        title: "History <img>",
        children: "Preserved record",
      }),
    }),
  );
  expect(html).toContain("<details>");
  expect(html).toContain("<summary>");
  expect(html).toContain("lucide-chevron-right");
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("History &lt;img&gt;");
  expect(html).not.toContain('role="button"');
});
it("space row is one expandable record with status, assignee and deadline before its form", () => {
  const html = renderToStaticMarkup(
    createElement(SpaceRow, {
      enabled: true,
      id: `space-${project.id}`,
      title: "Living room",
      status: "For Revision",
      designer: "Assigned Designer",
      deadline: "2026-11-15",
      risk: "At Risk",
      children: createElement("form", null, "Authorized status form"),
    }),
  );
  expect(html.indexOf("For Revision")).toBeLessThan(html.indexOf("<form"));
  expect(html.indexOf("Assigned Designer")).toBeLessThan(html.indexOf("<form"));
  expect(html).toContain(`id="space-${project.id}"`);
  expect(html).toContain("<details");
});
it("original space article remains available outside rebuild", () => {
  const html = renderToStaticMarkup(
    createElement(SpaceRow, {
      enabled: false,
      id: "space-original",
      title: "A",
      status: "Submitted",
      designer: "D",
      deadline: "None",
      risk: "",
      children: "Existing content",
    }),
  );
  expect(html).toContain('<article class="space-card"');
  expect(html).not.toContain("<summary");
});
it("Ops directory omits design and stakeholder details before commercial closure", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectDirectory, {
      view: "grid",
      projects: [project],
      options: projectDirectoryOptions({}),
      monitoring: { [project.id]: m },
      count: 1,
      ops: true,
      leads: { [project.lead_designer_id]: "Restricted person" },
    }),
  );
  expect(html).toContain("Limited pipeline preview");
  expect(html).not.toContain("Restricted person");
  expect(html).not.toContain("25%");
  expect(html).not.toContain("2026-11-15");
  expect(html).not.toContain("Design progress");
});
it("authorized project cards preserve equal-weighted design progress and escaped names", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectDirectory, {
      view: "grid",
      projects: [project],
      options: projectDirectoryOptions({ q: "Kitchen" }),
      monitoring: { [project.id]: m },
      count: 1,
      ops: false,
      leads: { [project.lead_designer_id]: "Lead Designer" },
    }),
  );
  expect(html).toContain("25.0%");
  expect(html).toContain('value="1" max="4"');
  expect(html).toContain("Kitchen &lt;script&gt;");
  expect(html).toContain("Lead Designer");
  expect(html).toContain("Filters");
  expect(html).not.toContain("Clear all");
});
it("leads keep distinct records for duplicate names, statuses and scoped pagination", () => {
  const lead = {
    ...emptyLead,
    id: project.id,
    bdm_id: project.lead_designer_id,
    reference: "LEAD-01",
    project_name: "Brief <script>",
    status: "Submitted",
    version: 1,
    submission_count: 1,
    created_at: project.created_at,
    updated_at: project.created_at,
    first_submitted_at: project.created_at,
    last_submitted_at: project.created_at,
    resolved_at: null,
  } as Lead;
  const html = renderToStaticMarkup(
    createElement(LeadDirectory, {
      leads: [
        lead,
        { ...lead, id: project.lead_designer_id, reference: "LEAD-02" },
      ],
      q: "Brief",
      status: "Submitted",
      page: 2,
      count: 60,
      bdm: false,
    }),
  );
  expect(html).toContain(`/dashboard/leads/${lead.id}`);
  expect(html).toContain(`/dashboard/leads/${project.lead_designer_id}`);
  expect(html).toContain("Brief &lt;script&gt;");
  expect(html).toContain("status=Submitted");
  expect(html).not.toContain("New request");
  expect(html).toContain("Previous");
  expect(html).toContain("Next");
});
it("empty BDM directory provides a real creation action without fabricated records", () => {
  const html = renderToStaticMarkup(
    createElement(LeadDirectory, {
      leads: [],
      q: "",
      status: "",
      page: 1,
      count: 0,
      bdm: true,
    }),
  );
  expect(html).toContain("New request");
  expect(html).toContain("No leads match this search or status.");
  expect(html).toContain("0 results");
  expect(html).not.toContain("LEAD-01");
});
it("project list mode preserves filters, pagination and the selected view in navigation", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectDirectory, {
      projects: [project],
      options: projectDirectoryOptions({
        q: "Kitchen",
        stage: "Under Negotiation",
        sort: "name",
        page: "2",
      }),
      count: 70,
      view: "list",
      columns: "project,stage,progress,handoff",
      ops: false,
      leads: {},
      monitoring: { [project.id]: m },
    }),
  );
  expect(html).toContain('data-project-view="list"');
  expect(html).toContain('aria-label="Project view"');
  expect(html).toContain("stage=Under+Negotiation");
  expect(html).toContain("sort=name");
  expect(html).toContain(
    "page=3&amp;view=list&amp;columns=project%2Cstage%2Cprogress%2Chandoff",
  );
  expect(html).toContain("Expected handoff");
  expect(html).toContain("<table");
  expect(html).toContain('aria-sort="ascending"');
  expect(html).toContain("Clear all");
  expect(html).toContain("25%");
});
it("list mode retains the Ops limited pipeline preview", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectDirectory, {
      projects: [project],
      options: projectDirectoryOptions({}),
      count: 1,
      view: "list",
      ops: true,
      leads: { [project.lead_designer_id]: "Restricted person" },
      monitoring: { [project.id]: m },
    }),
  );
  expect(html).toContain('data-project-view="list"');
  expect(html).toContain("Restricted preview");
  expect(html).not.toContain("Restricted person");
  expect(html).not.toContain("25%");
});

it("project directory defaults to list and preserves the favorites filter in view links", () => {
  const html = renderToStaticMarkup(
    createElement(ProjectDirectory, {
      projects: [project],
      options: projectDirectoryOptions({ favorites: "true" }),
      count: 1,
      ops: false,
      leads: {},
    }),
  );
  expect(html).toContain('data-project-view="list"');
  expect(html).toContain("Flagged projects");
  expect(html).toContain("favorites=true&amp;view=grid");
});
