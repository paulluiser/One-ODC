import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment } from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
loadStagingEnvironment();
const fixture = JSON.parse(
  readFileSync("artifacts/verification/phase6b2-ui/fixture.json", "utf8"),
);
test("6B.2 five-role compact workspace, genuine navigation, disclosures, focus and mobile", async ({
  page,
}) => {
  test.setTimeout(300000);
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
    await page
      .getByRole("button", { name: "Sign in to your workspace" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/dashboard/projects/${fixture.id}`);
    await expect(
      page.getByRole("heading", { name: fixture.name, exact: true }),
    ).toBeVisible();
    if (actor === "OPS") {
      await expect(
        page.getByRole("heading", { name: "Pipeline overview" }),
      ).toBeVisible();
      await expect(page.locator(".project-context")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Spaces", exact: true }),
      ).toHaveCount(0);
    } else {
      const nav = page.getByRole("navigation", {
        name: "Project workspace",
        exact: true,
      });
      await expect(page.locator(".project-context")).toBeVisible();
      if (actor === "DESIGNER")
        await expect(
          nav.getByRole("link", { name: "Financial Management", exact: true }),
        ).toHaveCount(0);
      const folded = page.locator("details").filter({
        has: page
          .locator(":scope > summary")
          .filter({ hasText: /^Activities and project controls$/ }),
      });
      await expect(folded).not.toHaveAttribute("open", "");
      await nav.getByRole("link", { name: "Spaces", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/#project-spaces$/);
      await expect(
        nav.getByRole("link", { name: "Spaces", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: "Activities", exact: true }).click();
      await expect(folded).toHaveAttribute("open", "");
      await expect(page.getByLabel("Timeline category")).toBeVisible();
      await page.goto(`/dashboard/projects/${fixture.id}`);
      if (actor === "BDM")
        await expect(page.locator("#space-create")).toHaveCount(0);
    }
    await accessible(page, `6B.2 ${actor} workspace light`, "phase6b2");
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await accessible(page, `6B.2 ${actor} workspace mobile dark`, "phase6b2");
    if (actor !== "OPS") {
      await page.goto(`/dashboard/projects/${fixture.id}?tab=quotation`);
      const nav = page.locator(
        'nav[aria-label="Project workspace"][data-ready="true"]',
      );
      const selected = nav.getByRole("link", {
        name: "Quotation",
        exact: true,
      });
      await expect(selected).toHaveAttribute("aria-current", "page");
      const viewport = await nav.boundingBox(),
        item = await selected.boundingBox();
      expect(viewport).not.toBeNull();
      expect(item).not.toBeNull();
      expect(item!.x).toBeGreaterThanOrEqual(viewport!.x - 1);
      expect(item!.x + item!.width).toBeLessThanOrEqual(
        viewport!.x + viewport!.width + 1,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Use light theme" }).click();
  }
});
