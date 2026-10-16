import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DashboardLoading } from "../../src/components/ui-r0/loading";
import { Empty } from "../../src/components/ui-r0/primitives";
it("announces dashboard loading without fabricating business records", () => {
  const html = renderToStaticMarkup(createElement(DashboardLoading));
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('role="status"');
  expect(html).toContain("Loading your authorized workspace");
  expect(html).not.toContain("Staging");
});
it("escapes untrusted text in reusable empty states", () => {
  const html = renderToStaticMarkup(
    createElement(Empty, {
      title: "No active projects",
      description: '<img src=x onerror="alert(1)">',
    }),
  );
  expect(html).toContain("No active projects");
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
});
