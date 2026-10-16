import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
const root = "ui-review/startup-composition",
  results = [];
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  for (const theme of ["Light", "Dark", "System"])
    for (const [viewport, width, height] of [
      ["desktop", 1440, 900],
      ["laptop", 1280, 800],
      ["mobile", 390, 844],
    ]) {
      const ctx = await browser.newContext({
          viewport: { width, height },
          colorScheme: theme === "Light" ? "light" : "dark",
        }),
        p = await ctx.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(
        `http://localhost:3006/startup-composition/?theme=${theme.toLowerCase()}`,
      );
      await p.evaluate(() => document.fonts.ready);
      await expect(p.locator("html")).toHaveClass(
        theme === "Light" ? /light/ : /dark/,
      );
      await expect(p.locator("main img:visible")).toHaveAttribute(
        "src",
        new RegExp(theme === "Light" ? "logo-light" : "logo-dark"),
      );
      await p.addStyleTag({
        content: ".preview-controls,.preview-note{visibility:hidden}",
      });
      const active = await p.locator("main").evaluate((el) =>
        el.getAnimations({ subtree: true }).map((a) => ({
          iterations: a.effect.getTiming().iterations,
          duration: a.effect.getTiming().duration,
        })),
      );
      expect(active.filter((a) => a.iterations === Infinity)).toHaveLength(5);
      expect(
        active
          .filter((a) => a.iterations === Infinity)
          .every((a) => a.duration === 4800),
      ).toBe(true);
      await p.locator("main").evaluate((el) =>
        el.getAnimations({ subtree: true }).forEach((a) => {
          a.pause();
          a.currentTime = 2400;
        }),
      );
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      mkdirSync(`${root}/screenshots`, { recursive: true });
      await p.screenshot({
        path: `${root}/screenshots/${theme.toLowerCase()}-${viewport}.png`,
      });
      const axe = await new AxeBuilder({ page: p }).analyze();
      expect(axe.violations).toEqual([]);
      await p.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await p
          .locator("main")
          .evaluate((el) => el.getAnimations({ subtree: true }).length),
      ).toBe(0);
      expect(
        await p
          .locator("main rect")
          .nth(1)
          .evaluate((el) => getComputedStyle(el).opacity),
      ).toBe("1");
      await p.screenshot({
        path: `${root}/screenshots/${theme.toLowerCase()}-${viewport}-reduced.png`,
      });
      if (theme === "System") {
        await p.emulateMedia({ colorScheme: "light" });
        await expect(p.locator("html")).toHaveClass(/light/);
        await expect(p.locator("main img:visible")).toHaveAttribute(
          "src",
          /logo-light/,
        );
      }
      expect(errors).toEqual([]);
      results.push({
        theme,
        viewport,
        status: "passed",
        violations: 0,
        incomplete: axe.incomplete.map((x) => x.id),
        reducedMotion: "static",
        overflow: false,
      });
      await ctx.close();
    }
  for (const theme of ["light", "dark"]) {
    const p = await browser.newPage({ viewport: { width: 720, height: 680 } });
    await p.goto(`http://localhost:3006/startup-composition/?theme=${theme}`);
    await p.evaluate(() => document.fonts.ready);
    await p.addStyleTag({
      content: ".preview-controls,.preview-note{visibility:hidden}",
    });
    await p
      .locator("main")
      .evaluate((el) => el.replaceWith(el.cloneNode(true)));
    mkdirSync(`artifacts/verification/startup-composition/frames-${theme}`, {
      recursive: true,
    });
    for (let frame = 0; frame < 30; frame++) {
      await p.locator("main").evaluate(
        (el, ms) =>
          el.getAnimations({ subtree: true }).forEach((a) => {
            a.pause();
            a.currentTime = ms;
          }),
        frame * 160,
      );
      await p.locator("main > div").screenshot({
        path: `artifacts/verification/startup-composition/frames-${theme}/${String(frame).padStart(2, "0")}.png`,
      });
    }
    await p.close();
  }
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const start = Date.now();
  await p.goto("http://localhost:3003/");
  await expect(p).toHaveURL(/\/login(?:\?|$)/, { timeout: 30000 });
  expect(errors).toEqual([]);
  results.push({
    screen: "real unauthenticated startup",
    status: "passed",
    redirectMs: Date.now() - start,
    clientErrors: 0,
    note: "Normal access verification redirects without waiting for assembly; preview capture holds are isolated to the artifact.",
  });
  await p.goto("http://localhost:3003/login");
  await expect(p.getByLabel("Work email")).toBeVisible();
  await p.close();
} finally {
  await browser.close();
  writeFileSync(
    "artifacts/verification/startup-composition/browser.json",
    JSON.stringify(results, null, 2),
  );
}
console.log(
  `${results.length} startup checks passed; 18 screenshots and 60 animation frames captured.`,
);
