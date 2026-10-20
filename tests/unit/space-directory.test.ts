import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/dashboard/projects/project",
  useSearchParams: () =>
    new URLSearchParams("tab=spaces&space_q=Kitchen&space_sort=name"),
}));
import { SpaceDirectory } from "../../src/components/space-directory";
it("renders six real-data columns, safe space names and filter-preserving detail links", () => {
  const html = renderToStaticMarkup(
    createElement(SpaceDirectory, {
      rows: [
        {
          id: "space-id",
          name: "Kitchen <script>",
          designer: "Jane Doe",
          status: "In Progress",
          deadline: null,
          updated: "2026-10-18T10:00:00Z",
        },
      ],
    }),
  );
  expect(
    [...html.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map((m) => m[1]),
  ).toEqual([
    "Space",
    "Assigned Designer",
    "Design status",
    "Post-closure readiness",
    "Deadline",
    "Updated",
  ]);
  expect(html).toContain("Kitchen &lt;script&gt;");
  expect(html).toContain("Jane Doe");
  expect(html).toContain("Not scheduled");
  expect(html).toContain(
    "space_q=Kitchen&amp;space_sort=name&amp;space_detail=space-id#space-space-id",
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("Attention");
  expect(html).not.toContain("Design Progress");
});
