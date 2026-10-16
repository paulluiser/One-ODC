// Explicit rollout step 2 only. Never prints connection credentials or database contents.
import { spawnSync } from "node:child_process";
import { mkdirSync, chmodSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
process.loadEnvFile(".env.production-rollout");
const uri = process.env.DATABASE_URL;
if (!uri)
  throw Error(
    "Configure DATABASE_URL in ignored .env.production-rollout first.",
  );
const parsed = new URL(uri);
const target = "qflmicucvbjfrjtndjgu";
if (
  !["postgres:", "postgresql:"].includes(parsed.protocol) ||
  !(
    parsed.hostname === `db.${target}.supabase.co` ||
    (parsed.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(parsed.username) === `postgres.${target}`)
  )
)
  throw Error("Refusing unexpected database target.");
const dir = `artifacts/verification/production-rollout/backup-${new Date().toISOString().replaceAll(":", "-")}`;
mkdirSync(dir, { recursive: true, mode: 0o700 });
const childEnv = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: parsed.pathname.slice(1) || "postgres",
  PGSSLMODE: "require",
  PGCONNECT_TIMEOUT: "15",
};
delete childEnv.DATABASE_URL;
const dump = `${dir}/database.dump`;
const result = spawnSync(
  "pg_dump",
  ["--format=custom", "--file", dump, "--no-owner", "--no-privileges"],
  { env: childEnv, encoding: "utf8", timeout: 180000 },
);
if (result.status !== 0)
  throw Error(
    "Production backup failed. Check the connection/password and installed pg_dump version locally; credentials were not logged.",
  );
chmodSync(dump, 0o600);
const catalog = spawnSync("pg_restore", ["--list", dump], {
  encoding: "utf8",
  timeout: 30000,
});
if (catalog.status !== 0 || !catalog.stdout.includes("TABLE DATA"))
  throw Error("Backup archive catalog verification failed; do not migrate.");
writeFileSync(`${dir}/catalog.txt`, catalog.stdout, { mode: 0o600 });
const manifest = {
  project: target,
  createdAt: new Date().toISOString(),
  file: dump,
  sha256: createHash("sha256").update(readFileSync(dump)).digest("hex"),
  catalogVerified: true,
  storageBytesIncluded: false,
  notes:
    "Database archive includes data/schema; Storage object bytes are separate. Initial production inspection found zero attachment objects. No restore rehearsal is implied.",
};
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify({ backup: dump, catalogVerified: true }));
