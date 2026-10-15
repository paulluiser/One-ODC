import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
type Check = {
  state: string;
  violations: unknown[];
  incomplete: unknown[];
  passedRules: number;
};
export async function accessible(page: Page, state: string, phase = "phase2") {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const compact = (items: typeof result.violations) =>
    items.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    }));
  const violations = compact(result.violations);
  const path = `artifacts/verification/${phase}-accessibility.json`;
  const checks: Check[] = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8")).checks
    : [];
  const updated = checks.filter((c) => c.state !== state);
  updated.push({
    state,
    violations,
    incomplete: compact(result.incomplete),
    passedRules: result.passes.length,
  });
  mkdirSync("artifacts/verification", { recursive: true });
  writeFileSync(path, JSON.stringify({ checks: updated }, null, 2) + "\n");
  expect.soft(violations, `Accessibility violations: ${state}`).toEqual([]);
}
