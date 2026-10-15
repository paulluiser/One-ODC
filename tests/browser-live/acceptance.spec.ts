import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment, stagingProject } from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
loadStagingEnvironment();
const accounts = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
const id = (actor: string) => accounts.find((a) => a.actor === actor)!.id;
async function login(page: Page, actor: string) {
  await page.goto("/login");
  await openWorkspacePanels(page);
  await page
    .getByLabel("Work email")
    .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("2D WCAG scans and keyboard acceptance: login, all five role workspaces, expanded forms, themes and mobile", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/login");
  await openWorkspacePanels(page);
  await accessible(page, "login light");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await accessible(page, "login dark");
  const project = await stagingProject(
    "2D accessibility",
    id("DESIGNER"),
    id("OPS"),
  );
  const url = `/dashboard/projects/${project.id}`;
  for (const actor of ["ADMIN", "LEAD", "DESIGNER", "BDM", "OPS"]) {
    await login(page, actor);
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await accessible(page, `${actor} dashboard dark`);
    if (actor === "LEAD") {
      await page.goto("/dashboard/projects");
      await openWorkspacePanels(page);
      await accessible(page, "project directory table");
    }
    await page.goto(url);
    await openWorkspacePanels(page);
    await expect(
      page.getByRole("heading", { name: project.name, exact: true }),
    ).toBeVisible();
    if (actor === "LEAD") {
      for (const title of [
        "Create a space",
        "Project controls and deadline revisions",
        "Record project activity",
      ]) {
        await page
          .locator("summary")
          .filter({ hasText: new RegExp(`^${title}$`) })
          .click();
      }
      await accessible(page, "LEAD expanded project dark");
      await page.getByRole("button", { name: "Use light theme" }).click();
      await accessible(page, "LEAD expanded project light");
      const form = page.locator("form").filter({
        has: page.getByRole("button", { name: "Hold Project", exact: true }),
      });
      await form
        .getByRole("button", { name: "Hold Project", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        form.getByLabel("Change reason", { exact: true }),
      ).toBeFocused();
      expect(
        await form
          .getByLabel("Change reason", { exact: true })
          .evaluate((node: HTMLTextAreaElement) => node.validity.valueMissing),
      ).toBe(true);
      await form
        .getByLabel("Change reason", { exact: true })
        .fill("Keyboard confirmation acceptance");
      await form
        .getByRole("button", { name: "Hold Project", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("dialog", { name: "Hold Project" }),
      ).toBeVisible();
      await accessible(page, "project confirmation light");
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]'),
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(
        form.getByRole("button", { name: "Hold Project", exact: true }),
      ).toBeFocused();
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pattern = `**${url}`;
      await page.route(pattern, async (route) => {
        if (route.request().method() === "POST") await gate;
        await route.continue();
      });
      try {
        await form
          .getByRole("button", { name: "Hold Project", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Confirm hold", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Saving…", exact: true }),
        ).toBeDisabled();
        release();
        await expect(
          page.getByRole("button", { name: "Resume Project", exact: true }),
        ).toBeVisible();
      } finally {
        release();
        await page.unroute(pattern);
      }
      const category = page.getByLabel("Timeline category");
      await category.focus();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("From date")).toBeFocused();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width: 360, height: 800 });
      await accessible(page, "LEAD mobile reduced motion");
      expect(
        await page
          .locator(".button")
          .first()
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe("0s");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Open navigation" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", {
          name: "Open navigation",
          includeHidden: true,
        }),
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByRole("dialog", { name: "Workspace navigation" }),
      ).toBeVisible();
      await accessible(page, "mobile navigation open");
      await page.keyboard.press("Shift+Tab");
      expect(
        await page.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]'),
        ),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Open navigation" }),
      ).toBeFocused();
      await page.setViewportSize({ width: 1280, height: 900 });
    } else await accessible(page, `${actor} project workspace`);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
});
