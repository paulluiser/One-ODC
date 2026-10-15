import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment } from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
loadStagingEnvironment();
const fixture = JSON.parse(
  readFileSync("artifacts/verification/phase6b3-ui/fixture.json", "utf8"),
);
test("6B.3 five-role commercial workspaces, supplier dialog focus, themes and mobile tables", async ({
  page,
}) => {
  test.setTimeout(300000);
  for (const role of ["ADMIN", "LEAD", "BDM", "DESIGNER", "OPS"]) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${role}_EMAIL`]!);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${role}_PASSWORD`]!);
    await page
      .getByRole("button", { name: "Sign in to your workspace" })
      .click();
    await expect(page).toHaveURL(/\/dashboard$/);
    for (const tab of ["quotation", "finance", "logistics", "installation"]) {
      await page.goto(`/dashboard/projects/${fixture.project}?tab=${tab}`);
      if (role === "OPS" && tab === "quotation") {
        await expect(
          page.getByRole("heading", {
            name: "Quotation · Approved version 1",
            exact: true,
          }),
        ).toHaveCount(0);
        continue;
      }
      await expect(
        page.getByRole("heading", {
          name:
            tab === "finance"
              ? "Financial summary"
              : tab === "quotation"
                ? "Quotation · Approved version 1"
                : tab === "logistics"
                  ? "Supplier & Logistics"
                  : "Installation",
          exact: true,
        }),
      ).toBeVisible();
      if (tab === "finance") {
        if (role === "OPS")
          expect(await page.content()).not.toContain("Current Sale:");
        if (["BDM", "DESIGNER"].includes(role))
          expect(await page.content()).not.toContain("Current Raw:");
        await expect(page.getByRole("table")).toHaveCount(2);
      }
      await accessible(page, `6B.3 ${role} ${tab} light`, "phase6b3");
      await page.getByRole("button", { name: "Use dark theme" }).click();
      await page.setViewportSize({ width: 360, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await accessible(page, `6B.3 ${role} ${tab} mobile dark`, "phase6b3");
      if (tab === "finance") {
        await page.locator(".commercial-table").evaluateAll((elements) =>
          elements.forEach((element) => {
            element.scrollLeft = element.scrollWidth;
          }),
        );
        await accessible(
          page,
          `6B.3 ${role} finance mobile dark right columns`,
          "phase6b3",
        );
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: "Use light theme" }).click();
    }
    if (["ADMIN", "LEAD", "OPS"].includes(role)) {
      await page.goto("/dashboard/suppliers");
      await page.getByLabel("Sort suppliers").selectOption("updated");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page).toHaveURL(/sort=updated/);
      const trigger = page.getByRole("button", {
        name: "Add supplier",
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", {
        name: "Add supplier",
        exact: true,
      });
      await expect(panel).toBeVisible();
      await expect(
        panel.getByLabel("Supplier name", { exact: true }),
      ).toBeFocused();
      for (let index = 0; index < 10; index++) {
        await page.keyboard.press("Tab");
        expect(
          await panel.evaluate((element) =>
            element.contains(document.activeElement),
          ),
        ).toBe(true);
        expect(
          await page.evaluate(
            () =>
              document.activeElement?.closest('[aria-hidden="true"]') !== null,
          ),
        ).toBe(false);
      }
      await accessible(page, `6B.3 ${role} supplier editor`, "phase6b3");
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.getByRole("button", { name: "Use dark theme" }).click();
      await page.setViewportSize({ width: 360, height: 800 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await accessible(page, `6B.3 ${role} supplier mobile dark`, "phase6b3");
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: "Use light theme" }).click();
    }
  }
});
