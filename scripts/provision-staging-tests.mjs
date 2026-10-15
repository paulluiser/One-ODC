import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const project = "jlvlwkryasoducuucvxk";
process.loadEnvFile(".env.verification");
const url = process.env.ONE_ODC_TEST_URL;
if (
  process.env.ONE_ODC_TEST_PROJECT_ID !== project ||
  new URL(url).hostname !== `${project}.supabase.co`
)
  throw new Error("Refusing provisioning outside authorized staging.");
const secret = process.env.ONE_ODC_TEST_SECRET_KEY;
if (!secret)
  throw new Error(
    "Save staging-only ONE_ODC_TEST_SECRET_KEY locally. No accounts created.",
  );
const admin = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const roles = {
  ADMIN: "system_administrator",
  BDM: "bdm",
  LEAD: "lead_designer",
  DESIGNER: "designer",
  OPS: "operations_admin",
  OTHER_BDM: "bdm",
  UNASSIGNED: "designer",
};
const previous = existsSync("artifacts/verification/staging-accounts.json")
  ? JSON.parse(
      readFileSync("artifacts/verification/staging-accounts.json", "utf8"),
    )
  : null;
if (previous && previous.project !== project)
  throw new Error("Account manifest belongs to another project.");
const run = previous?.run ?? randomUUID().slice(0, 8);
const accounts = previous?.accounts ?? [];
let env = readFileSync(".env.verification", "utf8");
function saveValue(key, value) {
  const line = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, "m");
  env = expression.test(env)
    ? env.replace(expression, line)
    : env + "\n" + line + "\n";
}
for (const [actor, role] of Object.entries(roles)) {
  if (accounts.some((account) => account.actor === actor)) continue;
  const email = `oneodc.${run}.${actor.toLowerCase()}@example.test`;
  const password = randomBytes(32).toString("base64url");
  // Generate an actual invitation without delivering email to synthetic addresses.
  const invitation = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: `One ODC staging ${actor}` } },
  });
  if (invitation.error || !invitation.data.user)
    throw new Error(
      `Staging invitation generation failed for ${actor}; no secret printed.`,
    );
  const sessionClient = createClient(
    url,
    process.env.ONE_ODC_TEST_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const accepted = await sessionClient.auth.verifyOtp({
    token_hash: invitation.data.properties.hashed_token,
    type: "invite",
  });
  if (accepted.error)
    throw new Error(`Staging invitation verification failed for ${actor}.`);
  const updated = await sessionClient.auth.updateUser({ password });
  if (updated.error)
    throw new Error(`Staging test password setup failed for ${actor}.`);
  await sessionClient.auth.signOut({ scope: "local" });
  saveValue(`ONE_ODC_TEST_${actor}_EMAIL`, email);
  saveValue(`ONE_ODC_TEST_${actor}_PASSWORD`, password);
  accounts.push({ actor, role, email, id: invitation.data.user.id });
  // Preserve completed progress after each account, without credentials in reports.
  writeFileSync(".env.verification", env, { mode: 0o600 });
  mkdirSync("artifacts/verification", { recursive: true });
  writeFileSync(
    "artifacts/verification/staging-accounts.json",
    JSON.stringify({ project, run, accounts }, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    project,
    created: accounts.length,
    invitationTokensVerified: true,
    credentials: "ignored .env.verification",
    roleActivation: "pending audited bootstrap",
  }),
);
