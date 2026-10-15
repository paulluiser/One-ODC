import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadStagingEnvironment } from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
import { dashboardPrimary } from "../../src/lib/workspace-presentation";
import { dashboardMetrics } from "../../src/lib/dashboard";
loadStagingEnvironment();
async function login(page: Page, actor: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page
    .getByLabel("Work email")
    .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]!);
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
function contrast(a: string, b: string) {
  const luminance = (rgb: string) => {
    const channels = rgb
      .match(/\d+/g)!
      .map(Number)
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test("6B.1 five-role shell, focus, themes, retained refresh and real pending save", async ({
  page,
}) => {
  test.setTimeout(300000);
  const checks: unknown[] = [];
  mkdirSync("artifacts/verification/phase6b1-ui", { recursive: true });
  for (const actor of ["ADMIN", "LEAD", "BDM", "DESIGNER", "OPS"]) {
    await login(page, actor);
    const role = (
      {
        ADMIN: "system_administrator",
        LEAD: "lead_designer",
        BDM: "bdm",
        DESIGNER: "designer",
        OPS: "operations_admin",
      } as const
    )[actor as "ADMIN" | "LEAD" | "BDM" | "DESIGNER" | "OPS"];
    const dashboardKpis = page.getByRole("region", {
      name: "Role KPIs",
      exact: true,
    });
    await expect(dashboardKpis.locator(".metric-primary")).toHaveCount(
      dashboardPrimary[role].length,
    );
    await expect(dashboardKpis.locator(".metric-card")).toHaveCount(
      dashboardMetrics[role].length,
    );
    const attentionBox = await page
      .getByRole("region", { name: "Action required", exact: true })
      .boundingBox();
    const kpiBox = await dashboardKpis.boundingBox();
    expect(attentionBox!.y).toBeLessThan(kpiBox!.y);
    await accessible(page, `6B.1 ${actor} dashboard light`, "phase6b1");
    const analytics = page
      .locator(".sidebar")
      .getByRole("link", { name: "Analytics", exact: true });
    await expect(analytics).toBeVisible();
    await page.keyboard.press("Tab");
    const sign = page.getByRole("button", { name: "Sign out", exact: true });
    await sign.focus();
    const focus = await sign.evaluate((e) => ({
      visible: e.matches(":focus-visible"),
      outline: getComputedStyle(e).outlineColor,
      bg: getComputedStyle(e.closest("aside")!).backgroundColor,
      color: getComputedStyle(e).color,
    }));
    expect(focus.visible).toBe(true);
    expect(focus.outline).toBe("rgb(146, 185, 255)");
    expect(focus.color).toBe("rgb(181, 194, 215)");
    const focusContrast = contrast(focus.outline, focus.bg);
    expect(focusContrast).toBeGreaterThanOrEqual(3);
    checks.push({ actor, focus, focusContrast });
    await analytics.click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(
      page.getByRole("heading", { name: "Project analytics", exact: true }),
    ).toBeVisible();
    await expect(page.locator('.sidebar [aria-current="page"]')).toHaveText(
      "Analytics",
    );
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("Analytics");
    await expect(page.locator(".startup-state")).toHaveCount(0);
    const analyticsKpis = page.getByRole("region", {
      name: "Analytics KPIs",
      exact: true,
    });
    const primaryCount = await analyticsKpis.locator(".metric-primary").count();
    expect(primaryCount).toBeGreaterThanOrEqual(4);
    expect(primaryCount).toBeLessThanOrEqual(6);
    await page.keyboard.press("Tab");
    await analytics.focus();
    expect(
      await analytics.evaluate((e) => ({
        visible: e.matches(":focus-visible"),
        outline: getComputedStyle(e).outlineColor,
      })),
    ).toEqual({ visible: true, outline: "rgb(146, 185, 255)" });
    if (["OPS", "DESIGNER"].includes(actor))
      await expect(
        page.getByText("Current authorized Sale", { exact: true }),
      ).toHaveCount(0);
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(
      page.getByRole("button", { name: "Use dark theme" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.emulateMedia({ colorScheme: "light" });
    await page.getByRole("button", { name: "Follow system theme" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
      page.getByRole("button", { name: "Follow system theme" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
    const drawerSignOut = page
      .getByRole("dialog", { name: "Workspace navigation" })
      .getByRole("button", { name: "Sign out", exact: true });
    await page.keyboard.press("Tab");
    await drawerSignOut.focus();
    expect(
      await drawerSignOut.evaluate((e) => ({
        visible: e.matches(":focus-visible"),
        outline: getComputedStyle(e).outlineColor,
      })),
    ).toEqual({ visible: true, outline: "rgb(146, 185, 255)" });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await accessible(page, `6B.1 ${actor} mobile system dark`, "phase6b1");
    await page.screenshot({
      path: `artifacts/verification/phase6b1-ui/${actor.toLowerCase()}-mobile.png`,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Use light theme" }).click();
  }
  await login(page, "BDM");
  await page.goto("/dashboard/leads/new");
  const name = `6B.1 UI ${randomUUID()}`;
  await page
    .getByLabel("Project Name / Client Name", { exact: false })
    .fill(name);
  await page.getByLabel("Address", { exact: false }).fill(`Staging ${name}`);
  await page.getByLabel("Estimated Cabinetries", { exact: false }).fill("1");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Pending-state input must remain intact.");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/dashboard/leads/new", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator(".operation-pending")).toContainText(
      "Saving changes…",
    );
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(
      "Pending-state input must remain intact.",
    );
    await expect(
      page.getByRole("button", { name: "Saving…" }).first(),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/dashboard\/leads\/[0-9a-f-]+$/);
  await page.unroute("**/dashboard/leads/new");
  await page.goto("/dashboard/analytics");
  const title = page.getByRole("heading", {
    name: "Project analytics",
    exact: true,
  });
  await expect(title).toBeVisible();
  let refreshRelease!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    refreshRelease = resolve;
  });
  await page.route("**/dashboard/analytics*", async (route) => {
    if (route.request().headers()["rsc"]) await refreshGate;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Refresh workspace" }).click();
    await expect(page.locator("#workspace-main")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(title).toBeVisible();
    await expect(page.locator(".startup-state")).toHaveCount(0);
    await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
  } finally {
    refreshRelease();
  }
  await expect(page.locator("#workspace-main")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.unroute("**/dashboard/analytics*");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("link", { name: "Analytics", exact: true }).first(),
  ).toBeVisible();
  expect(
    await page
      .locator(".sidebar .nav-item")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await accessible(page, "6B.1 BDM desktop light", "phase6b1");
  await page.screenshot({
    path: "artifacts/verification/phase6b1-ui/bdm-desktop.png",
  });
  writeFileSync(
    "artifacts/verification/phase6b1-ui/checks.json",
    JSON.stringify(checks, null, 2) + "\n",
  );
});
