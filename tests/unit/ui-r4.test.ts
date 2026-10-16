import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("../../src/app/dashboard/users/history-actions", () => ({
  loadAccessHistory: vi.fn(),
}));
vi.mock("../../src/components/logistics-form", () => ({
  LogisticsForm: () => null,
}));
vi.mock("../../src/components/workflow-forms", () => ({
  InvitationForm: () => null,
  UserAccessForm: () => null,
}));
import {
  LogisticsTracker,
  OperationSummary,
  OperationsFrame,
  ReadinessGroups,
  OperationEditor,
} from "../../src/components/ui-r4/primitives";
import {
  SupplierDirectory,
  UserDirectory,
} from "../../src/components/ui-r4/directories";
const render = (node: React.ReactNode) => renderToStaticMarkup(node);
it("stage tracker highlights only the actual stage and never implies skipped stages complete", () => {
  const h = render(
    createElement(LogisticsTracker, {
      stages: ["RFP", "In Transit", "Delivered"],
      current: "Delivered",
    }),
  );
  expect((h.match(/aria-current="step"/g) || []).length).toBe(1);
  expect(h).toContain("Earlier or skipped stages are not marked completed");
  expect(h).not.toContain("data-completed");
});
it("disclosures expose Lucide collapsed/expanded indicators with native semantics", () => {
  const h = render(
    createElement(OperationsFrame, {
      children: createElement(
        "details",
        null,
        createElement(OperationSummary, null, "History"),
      ),
    }),
  );
  expect(h).toContain("<summary>");
  expect(h).toContain("lucide-chevron-right");
  expect(h).toContain("lucide-chevron-down");
});
it("blockers group by prerequisite and link to source spaces/logistics without calculating readiness", () => {
  const h = render(
    createElement(ReadinessGroups, {
      project: "p",
      blockers: [
        { kind: "design", id: "s", label: "Kitchen: Submitted" },
        { kind: "logistics", id: "l", label: "Cabinets: In Transit" },
      ],
    }),
  );
  expect(h).toContain("#space-s");
  expect(h).toContain("tab=logistics#logistics-l");
  expect(h).toContain("No outstanding prerequisites in this group");
  expect(h).toContain("Kitchen: Submitted");
});
it("legacy action retains its existing disclosure outside the rebuild", () => {
  const h = render(
    createElement(OperationEditor, {
      title: "Edit",
      enabled: false,
      children: "Existing form",
    }),
  );
  expect(h).toContain("<details><summary>Edit</summary>");
  expect(h).toContain("Existing form");
});
it("supplier empty directory has honest search and create controls, no fabricated row", () => {
  const h = render(
    createElement(SupplierDirectory, {
      suppliers: [],
      events: [],
      search: "<img>",
      sort: "name",
      page: 1,
      count: 0,
    }),
  );
  expect(h).toContain("No suppliers found");
  expect(h).toContain("&lt;img&gt;");
  expect(h).not.toContain("Sample Supplier");
});
it("admin presents only fetched profiles and reports unavailable invitation configuration", () => {
  const h = render(
    createElement(UserDirectory, {
      profiles: [
        {
          id: "id",
          display_name: "Team <script>",
          role: "designer",
          active: false,
        },
      ],
      count: 1,
      page: 1,
      configured: false,
      history: [],
    }),
  );
  expect(h).toContain("Team &lt;script&gt;");
  expect(h).toContain("Inactive");
  expect(h).toContain("Invitations are unavailable");
  expect(h).toContain("Administrative history");
  expect(h).toContain("Role and access guidance");
  expect(h).not.toContain("Latest 50 access and invitation events");
});
