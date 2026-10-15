import { openWorkspacePanels } from "../helpers/workspace-ui";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadStagingEnvironment } from "../helpers/staging";
import { accessible } from "../helpers/accessibility";
import { pngFixture } from "../helpers/png-fixture";
import { pdfFixture } from "../helpers/pdf-fixtures";
loadStagingEnvironment();
const actors = JSON.parse(
  readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
).accounts as { actor: string; id: string }[];
async function login(page: Page, actor: string) {
  await page.context().clearCookies();
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
test("3E Notes/links persist through real conversion; optimized PDF and three inherited file slots remain scoped", async ({
  page,
}) => {
  test.setTimeout(240000);
  await login(page, "BDM");
  await page.goto("/dashboard/leads/new");
  await openWorkspacePanels(page);
  const name = `3E browser ${randomUUID()}`;
  await page
    .getByLabel("Project Name / Client Name", { exact: false })
    .fill(name);
  await page.getByLabel("Address", { exact: false }).fill(`Synthetic ${name}`);
  await page.getByLabel("Estimated Cabinetries", { exact: false }).fill("1");
  const notes = "<img src=x onerror=alert(1)>\nPlain Notes";
  await page.getByLabel("Notes", { exact: true }).fill(notes);
  await page.getByRole("button", { name: "Add Link", exact: true }).click();
  await page
    .getByLabel("Resource link 1", { exact: true })
    .fill("http://example.com/bad");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/leads\/new$/);
  await page
    .getByLabel("Resource link 1", { exact: true })
    .fill("https://example.com/plans");
  await page.getByRole("button", { name: "Add Link", exact: true }).click();
  await page
    .getByLabel("Resource link 2", { exact: true })
    .fill("https://example.com/specs");
  await accessible(page, "3E BDM links Notes light", "phase3e");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/leads\/[0-9a-f-]+$/);
  const leadUrl = page.url();
  await page.reload();
  await openWorkspacePanels(page);
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(notes);
  await expect(page.getByLabel("Resource link 2", { exact: true })).toHaveValue(
    "https://example.com/specs",
  );
  for (let i = 0; i < 3; i++) {
    await expect(page.getByLabel("File to upload or resume")).toBeEnabled();
    await page.getByLabel("File to upload or resume").setInputFiles({
      name: i === 0 ? "vector.pdf" : `file-${i}.txt`,
      mimeType: i === 0 ? "application/pdf" : "text/plain",
      buffer:
        i === 0 ? Buffer.from(pdfFixture("vector")) : Buffer.from("synthetic"),
    });
    if (i === 0)
      await expect(
        page.getByText(/Validated lossless PDF optimization/),
      ).toBeVisible();
    await page
      .getByRole("button", { name: "Upload file", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Get download link" }),
    ).toHaveCount(i + 1);
  }
  await page.getByLabel("File to upload or resume").setInputFiles({
    name: "transparent.png",
    mimeType: "image/png",
    buffer: pngFixture(),
  });
  await expect(
    page.getByText(/PNG lossless pixel\/alpha comparison passed/),
  ).toBeVisible();
  const photo = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 1000;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 3000, 1000);
    gradient.addColorStop(0, "#125987");
    gradient.addColorStop(1, "#f8df83");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 3000, 1000);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 1),
    );
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.getByLabel("File to upload or resume").setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(photo),
  });
  await expect(page.getByText(/Lossless\/drawing-safe mode/)).toBeVisible();
  await page.getByRole("checkbox", { name: /This is a photograph/ }).check();
  await page
    .getByRole("button", { name: "Optimize selected file", exact: true })
    .click();
  await expect(
    page.getByText(/Opt-in photograph resized to at most 2560 px/),
  ).toBeVisible();
  const photoStats = await page
    .getByText(/Opt-in photograph resized to at most 2560 px/)
    .textContent();
  expect(Number(photoStats?.match(/Saved:\s*([0-9.]+)%/)?.[1])).toBeGreaterThan(
    0,
  );
  await page.getByLabel("File to upload or resume").setInputFiles({
    name: "fourth.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("additional"),
  });
  await expect(
    page.getByRole("button", { name: "Upload file", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/3 \/ 3 active uploaded files/)).toContainText(
    "0 slots remaining",
  );
  await page.getByRole("button", { name: "Submit lead", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Request details", exact: true }),
  ).toBeVisible();
  await login(page, "LEAD");
  await page.goto(leadUrl);
  await openWorkspacePanels(page);
  await expect(
    page.getByRole("link", { name: /https:\/\/example.com\/plans/ }),
  ).toBeVisible();
  await page
    .getByLabel("Primary Designer", { exact: false })
    .selectOption(actors.find((a) => a.actor === "DESIGNER")!.id);
  await page
    .getByRole("button", { name: "Accept and create Project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+$/);
  await openWorkspacePanels(page);
  const projectUrl = page.url();
  await expect(
    page.getByRole("paragraph").filter({ hasText: notes }),
  ).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  await expect(
    page.getByRole("button", { name: "Get download link" }),
  ).toHaveCount(3);
  const edit = page.getByRole("form", { name: "Edit Notes and resources" });
  await edit
    .getByLabel("Notes", { exact: true })
    .fill("Authorized updated Notes");
  await edit.getByRole("button", { name: "Remove Link 2" }).click();
  await edit
    .getByLabel("Required change reason")
    .fill("Client confirmed brief");
  await edit.getByRole("button", { name: "Save Notes and resources" }).click();
  await expect(
    page.getByText("Notes and resources saved with audit history."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, "3E project resources dark mobile", "phase3e");
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "DESIGNER");
  await page.goto(projectUrl);
  await openWorkspacePanels(page);
  await expect(
    page.getByText("Authorized updated Notes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("form", { name: "Edit Notes and resources" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /https:\/\/example.com\/specs/ }),
  ).toHaveCount(0);
  await login(page, "OTHER_BDM");
  await page.goto(projectUrl);
  await openWorkspacePanels(page);
  await expect(
    page.getByText("Authorized updated Notes", { exact: true }),
  ).toHaveCount(0);
});
