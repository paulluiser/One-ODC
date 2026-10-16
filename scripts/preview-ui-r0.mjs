import { spawn } from "node:child_process";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw Error("Staging preview only");
const appEnv = { ...process.env };
for (const key of Object.keys(appEnv))
  if (key.startsWith("ONE_ODC_TEST_") || key === "SUPABASE_SECRET_KEY")
    delete appEnv[key];
Object.assign(appEnv, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.ONE_ODC_TEST_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: "http://localhost:3003",
  // Opt-in only for the explicitly authorized staging invitation acceptance check.
  // This remains server-only; the default preview has no administrative secret.
  SUPABASE_SECRET_KEY: process.argv.includes("--verify-invitations")
    ? process.env.ONE_ODC_TEST_SECRET_KEY || ""
    : "",
  ONE_ODC_UI_R0_ENABLED: "true",
});
for (const flag of [
  "DASHBOARDS",
  "ANALYTICS",
  "CALENDAR",
  "INSTALLATIONS",
  "LOGISTICS",
  "HANDOFF",
  "RESOURCES",
  "ATTACHMENTS",
  "SPACES",
  "MONITORING",
  "QUOTATIONS",
  "FINANCE",
])
  appEnv[`ONE_ODC_${flag}_ENABLED`] = "true";
const command = process.argv.includes("--build")
  ? ["build", "--webpack"]
  : [
      ...(process.argv.includes("--production")
        ? ["start"]
        : ["dev", "--webpack"]),
      "--hostname",
      "127.0.0.1",
      "--port",
      "3003",
    ];
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", ...command],
  { env: appEnv, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
