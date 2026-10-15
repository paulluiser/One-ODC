import { expect, test } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceSkeleton } from "../../src/components/workspace-skeleton";
test("6B.1 destination skeletons announce pending state and reflow without fabricated records", async ({
  page,
}) => {
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((elements) => elements.map((e) => e.outerHTML).join(""));
  const destinations = [
    "dashboard",
    "projects",
    "project",
    "analytics",
    "leads",
    "lead",
    "suppliers",
    "users",
    "notifications",
  ] as const;
  // Render actual loading components only; no authentication or business records are simulated.
  const markup = renderToStaticMarkup(
    <main style={{ padding: 16 }}>
      {destinations.map((destination) => (
        <WorkspaceSkeleton key={destination} destination={destination} />
      ))}
    </main>,
  );
  await page.setContent(
    `<!doctype html><html lang="en"><head>${styles}</head><body>${markup}</body></html>`,
  );
  await expect(page.getByRole("status")).toHaveCount(destinations.length);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(
    destinations.length,
  );
  await expect(page.locator("progress, .startup-state, button, a")).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".skeleton-line")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
});
test("6B.1 startup exists only while access navigation is unresolved and never invents progress", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/dashboard", async (route) => {
    if (route.request().method() === "GET") {
      await gate;
    }
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Inspect the still-visible document without waiting for the intentionally blocked navigation.
    await expect
      .poll(() =>
        page.evaluate(() => ({
          startup: !!document.querySelector(".startup-state"),
          tagline: document
            .querySelector(".startup-state")
            ?.textContent?.includes("Every space. One vision."),
          sidebars: document.querySelectorAll(".sidebar").length,
          progress: document.querySelectorAll("progress").length,
        })),
      )
      .toEqual({ startup: true, tagline: true, sidebars: 0, progress: 0 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".startup-indicator")!)
            .animationName,
      ),
    ).toBe("none");
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".startup-state")).toHaveCount(0);
  await page.goto("/#error=access_denied&type=invite");
  await expect(page).toHaveURL(/\/auth\/error$/);
});
