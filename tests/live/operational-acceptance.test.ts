import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const run = promisify(execFile);
it("4D complete real-JWT journey, parallel work, files, financial continuity, concurrency, revocation and bounded queries", async () => {
  const { stdout } = await run(
    process.execPath,
    ["scripts/staging-operational-acceptance.mjs"],
    { timeout: 180000 },
  );
  const result = JSON.parse(stdout);
  expect(result.cycles).toBe(2);
  expect(result.approvedTotal).toBe("0.21");
  expect(Object.keys(result.timings)).toEqual([
    "projects",
    "spaces",
    "finance",
    "timeline",
  ]);
}, 190000);
