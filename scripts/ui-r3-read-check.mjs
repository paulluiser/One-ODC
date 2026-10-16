import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging only");
const project = JSON.parse(
  readFileSync("artifacts/verification/monitoring-closed-fixture.json", "utf8"),
).id;
const clients = {};
for (const actor of ["LEAD", "BDM", "OPS"]) {
  const c = createClient(
    process.env.ONE_ODC_TEST_URL,
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await c.auth.signInWithPassword({
    email: process.env[`ONE_ODC_TEST_${actor}_EMAIL`],
    password: process.env[`ONE_ODC_TEST_${actor}_PASSWORD`],
  });
  if (error) throw Error(`${actor} sign-in failed`);
  clients[actor] = c;
}
const results = [];
for (let wave = 1; wave <= 3; wave++) {
  await Promise.all(
    Object.entries(clients).map(async ([actor, c]) => {
      const calls = [
        [
          "project",
          () =>
            c
              .from("projects")
              .select("id,name,commercial_status")
              .eq("id", project)
              .single(),
        ],
        [
          "finance",
          () => c.rpc("get_project_financials", { p_project: project }),
        ],
        ...(actor === "OPS"
          ? []
          : [
              [
                "quotation",
                () => c.rpc("get_project_quotation", { p_project: project }),
              ],
            ]),
      ];
      for (const [operation, run] of calls) {
        const start = performance.now();
        const r = await run();
        results.push({
          wave,
          actor,
          operation,
          status: r.status,
          code: r.error?.code ?? null,
          ms: Math.round(performance.now() - start),
        });
      }
    }),
  );
}
const summary = {
  reads: results.length,
  failed: results.filter((r) => r.code || r.status !== 200),
  minMs: Math.min(...results.map((r) => r.ms)),
  maxMs: Math.max(...results.map((r) => r.ms)),
  results,
};
mkdirSync("artifacts/verification/ui-r3", { recursive: true });
writeFileSync(
  "artifacts/verification/ui-r3/read-check.json",
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({
    reads: summary.reads,
    failures: summary.failed,
    minMs: summary.minMs,
    maxMs: summary.maxMs,
  }),
);
for (const c of Object.values(clients)) await c.auth.signOut();
