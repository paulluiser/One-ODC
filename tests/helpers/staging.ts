import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
export function loadStagingEnvironment() {
  process.loadEnvFile(".env.verification");
  if (
    process.env.ONE_ODC_TEST_PROJECT_ID !== "jlvlwkryasoducuucvxk" ||
    new URL(process.env.ONE_ODC_TEST_URL!).hostname !==
      "jlvlwkryasoducuucvxk.supabase.co"
  )
    throw new Error("Refusing tests outside authorized staging.");
}
// Isolate the SDK from Playwright's TypeScript loader; credentials stay in the ignored file.
async function fixture(action: string, ...args: string[]) {
  const { stdout } = await execute(
    process.execPath,
    ["scripts/staging-project-fixture.mjs", action, ...args],
    { timeout: 40000 },
  );
  return JSON.parse(stdout);
}
export async function stagingProject(
  prefix: string,
  primary: string,
  ops: string,
): Promise<{ id: string; name: string; leadId: string }> {
  return fixture("create", prefix, primary, ops);
}
export async function verifyProjectMembership(project: string): Promise<{
  history: number;
  DESIGNER: number;
  OTHER_BDM: number;
  UNASSIGNED: number;
}> {
  return fixture("verify", project);
}

export async function quotationSpaces(
  project: string,
  primary: string,
): Promise<string[]> {
  return fixture("quotation-spaces", project, primary);
}

export async function touchQuotation(
  project: string,
  space: string,
): Promise<void> {
  await fixture("quotation-touch", project, space);
}

export async function financeQuotation(
  project: string,
  primary: string,
): Promise<{ quotation: string }> {
  return fixture("finance-quotation", project, primary);
}

export async function installationSetup(
  project: string,
  primary: string,
  ops: string,
): Promise<{ spaces: string[] }> {
  return fixture("installation-setup", project, primary, ops);
}

export async function operationalJourney(): Promise<{
  project: string;
  space: string;
  cancelled: string;
  name: string;
  quotation: string;
  timings: Record<string, number[]>;
}> {
  const { stdout } = await execute(
    process.execPath,
    ["scripts/staging-operational-acceptance.mjs"],
    { timeout: 180000 },
  );
  return JSON.parse(stdout);
}

export async function financeSupportFixture(project: string): Promise<void> {
  await fixture("finance-support-fixture", project);
}
