import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CompositionStartup } from "../../src/components/composition-startup";
it("renders an accessible immediate status with decorative assembly and theme-auto supplied branding", () => {
  const html = renderToStaticMarkup(
    createElement(CompositionStartup, { message: "Preparing your workspace" }),
  );
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-atomic="true"');
  expect(html).toContain('data-logo-theme="auto"');
  expect(html).toContain("Every space. One vision.");
  expect(html).toContain("Preparing your workspace");
  expect(html).toContain('aria-hidden="true" focusable="false"');
  expect(html).not.toMatch(/progressbar|startup-indicator/);
});
it("preserves explicit access-verification copy and escapes it", () => {
  const html = renderToStaticMarkup(
    createElement(CompositionStartup, {
      message: "Checking <script>access</script>",
    }),
  );
  expect(html).toContain("Checking &lt;script&gt;access&lt;/script&gt;");
  expect(html).not.toContain("<script>");
});
