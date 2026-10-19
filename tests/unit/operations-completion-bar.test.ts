import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("../../src/components/installation-action-dialog", () => ({
  InstallationActionDialog: ({
    readiness,
    primary,
  }: {
    readiness: { ready: boolean };
    primary: boolean;
  }) =>
    createElement(
      "button",
      { "data-primary": primary, "data-ready": readiness.ready },
      "Complete project operations",
    ),
}));
import { OperationsCompletionBar } from "../../src/components/operations-completion-bar";
import type { Readiness } from "../../src/lib/installations";
const readiness: Readiness = {
  project_id: "p",
  version: 1,
  cycle: 1,
  ready: false,
  completed: false,
  can_complete: true,
  blockers: [
    { kind: "design", id: "s", label: "Space design" },
    { kind: "installation", id: "s", label: "Space installation" },
    { kind: "logistics", id: "l", label: "Shipping" },
  ],
  history: [],
};
const render = (r: Readiness) =>
  renderToStaticMarkup(
    createElement(OperationsCompletionBar, { project: "p", readiness: r }),
  );
it("offers one authorized action while keeping prerequisite messaging in the modal", () => {
  const h = render(readiness);
  expect(h).not.toContain("outstanding items");
  expect(h.match(/<button/g)).toHaveLength(1);
  expect(h).toContain('data-primary="true"');
  expect(h).toContain('data-ready="false"');
});
it("does not offer a completion action to unauthorized readers", () => {
  const h = render({ ...readiness, can_complete: false });
  expect(h).not.toContain("<button");
  expect(h).not.toContain("outstanding items");
});
it("replaces the completion action with preserved completion status and history", () => {
  const h = render({ ...readiness, completed: true, cycle: null });
  expect(h).not.toContain("<button");
  expect(h).toContain("Operationally completed");
  expect(h).not.toContain("outstanding items");
  expect(h).toContain("View completion history");
  expect(h).toContain('data-completed="true"');
});
it("uses authoritative readiness without fabricating prerequisites", () => {
  const h = render({ ...readiness, ready: true, blockers: [] });
  expect(h).not.toContain("Ready for completion");
  expect(h).toContain('data-ready="true"');
});
