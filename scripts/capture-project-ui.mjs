import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
process.loadEnvFile(".env.verification");
if (process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk")
  throw Error("Staging only");
const root = "artifacts/verification/phase6b2-ui";
mkdirSync(root, { recursive: true });
let fixture;
if (existsSync(`${root}/fixture.json`))
  fixture = JSON.parse(readFileSync(`${root}/fixture.json`));
else {
  const accounts = JSON.parse(
    readFileSync("artifacts/verification/staging-accounts.json"),
  ).accounts;
  const id = (k) => accounts.find((a) => a.actor === k).id;
  fixture = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/staging-project-fixture.mjs",
        "create",
        "6B2 workspace",
        id("DESIGNER"),
        id("OPS"),
      ],
      { encoding: "utf8" },
    ),
  );
  execFileSync(process.execPath, [
    "scripts/staging-project-fixture.mjs",
    "quotation-spaces",
    fixture.id,
    id("DESIGNER"),
  ]);
  writeFileSync(`${root}/fixture.json`, JSON.stringify(fixture, null, 2));
}
const phase = process.argv[2] || "after",
  dir = `${root}/${phase}`;
mkdirSync(dir, { recursive: true });
const b = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  for (const actor of phase === "before"
    ? ["ADMIN", "BDM"]
    : ["ADMIN", "LEAD", "BDM", "DESIGNER", "OPS"]) {
    const c = await b.newContext({
        viewport: { width: 1440, height: 1000 },
        colorScheme: "light",
      }),
      p = await c.newPage();
    await p.goto("http://127.0.0.1:3002/login");
    await p
      .getByLabel("Work email")
      .fill(process.env[`ONE_ODC_TEST_${actor}_EMAIL`]);
    await p
      .getByLabel("Password", { exact: true })
      .fill(process.env[`ONE_ODC_TEST_${actor}_PASSWORD`]);
    await p.getByRole("button", { name: "Sign in to your workspace" }).click();
    await p.waitForURL("**/dashboard");
    const routes = [
      ["projects", "/dashboard/projects"],
      ["project", `/dashboard/projects/${fixture.id}`],
      ...(actor === "BDM"
        ? [
            ["new-lead", "/dashboard/leads/new"],
            ["lead", `/dashboard/leads/${fixture.leadId}`],
          ]
        : []),
    ];
    for (const [name, url] of routes) {
      await p.goto(`http://127.0.0.1:3002${url}`);
      await p.locator(".page-intro h1").waitFor();
      if (name === "project") {
        if (actor === "OPS")
          await p
            .getByRole("heading", { name: "Pipeline overview", exact: true })
            .waitFor();
        else {
          await p.locator(".project-context").waitFor();
          await p
            .getByRole("heading", { name: "Spaces", exact: true })
            .waitFor();
          await p
            .getByRole("heading", { name: "Notes", exact: true })
            .waitFor();
        }
      }
      if (name === "projects") await p.locator(".directory-table").waitFor();
      for (const theme of ["light", "dark"]) {
        await p.getByRole("button", { name: `Use ${theme} theme` }).click();
        for (const size of ["desktop", "mobile"]) {
          await p.setViewportSize(
            size === "desktop"
              ? { width: 1440, height: 1000 }
              : { width: 360, height: 800 },
          );
          await p.screenshot({
            path: `${dir}/${actor.toLowerCase()}-${name}-${theme}-${size}.png`,
            fullPage: true,
          });
        }
      }
    }
    await c.close();
    console.log(`${actor} ${phase} captures saved`);
  }
} finally {
  await b.close();
}
