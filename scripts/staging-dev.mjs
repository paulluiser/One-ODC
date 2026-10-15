import { spawn } from "node:child_process";
process.loadEnvFile(".env.verification");
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
  new URL(process.env.ONE_ODC_TEST_URL).hostname !==
    "jlvlwkryasoducuucvxk.supabase.co"
)
  throw new Error("Refusing non-staging preview.");
// Forward only public application configuration. Never forward test passwords or the provisioning secret to Next.
const appEnv = { ...process.env };
for (const key of Object.keys(appEnv))
  if (key.startsWith("ONE_ODC_TEST_") || key === "SUPABASE_SECRET_KEY")
    delete appEnv[key];
Object.assign(appEnv, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.ONE_ODC_TEST_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3002",
  SUPABASE_SECRET_KEY: "",
  ONE_ODC_DASHBOARDS_ENABLED: "true",
  ONE_ODC_ANALYTICS_ENABLED: "true",
  ONE_ODC_INSTALLATIONS_ENABLED: "true",
  ONE_ODC_LOGISTICS_ENABLED: "true",
  ONE_ODC_HANDOFF_ENABLED: "true",
  ONE_ODC_RESOURCES_ENABLED: "true",
  ONE_ODC_ATTACHMENTS_ENABLED: "true",
  ONE_ODC_SPACES_ENABLED: "true",
  ONE_ODC_MONITORING_ENABLED: "true",
  ONE_ODC_QUOTATIONS_ENABLED: "true",
  ONE_ODC_FINANCE_ENABLED: "true",
});
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3002",
  ],
  { env: appEnv, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
