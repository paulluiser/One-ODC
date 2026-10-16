# Production rollout — steps 1 and 2

Authorized scope: release preparation and production database preparation only. No hosting configuration, website deployment, production seed data or test users.

## Release

Source: `codex/ui-r0-frontend-rebuild`, based on main `98086f4`. Include approved rebuilt frontend/branding, calendar, microfeatures, notifications and revised commercial workflow. Credentials, local fixture manifests, screenshots, node_modules and private environment files are excluded. Fresh installation/checks run in a clean temporary checkout. Typechecking explicitly generates Next route types before tsc so CI does not depend on a previous local build.

## Database

Production project: `qflmicucvbjfrjtndjgu` (One ODC). Read-only inspection confirmed four baseline migrations already applied, one active System Administrator, no leads/projects/attachments and a private 50 MiB attachment bucket. Baseline migration versions: 20261013065850, 20261013070524, 20261013071132, 20261013080433. Do not reapply them. Local later migrations are the ordered production upgrade source; staging uses split/version-remapped entries and unrelated tracker lineage, so do not blindly sync its migration history.

Before any production migration, create a full PostgreSQL backup and verify its archive catalog. Save the production connection URI locally in ignored `.env.production-rollout` as DATABASE_URL. Use the production dashboard Connect dialog; Session pooler is suitable when direct IPv6 is unavailable. Never commit the URI or paste credentials in chat. Backup artifacts must stay ignored/restricted. Pending filenames/checksums are in ignored `artifacts/verification/production-rollout/migration-plan.json`.

Apply only reviewed missing migrations in timestamp order. Enum addition must commit before functions referencing Lost. Preserve production profiles/Auth, audits and files; do not run UAT/reset scripts. After migration, verify schema/RLS, private RPC grants, Storage cap/privacy, unchanged accounts/business counts and advisor results. Do not test business writes using production data. Website enablement, production variables, domain/Auth redirect setup and invitation onboarding remain steps 3–5 and are outside this authorization.

Current database checkpoint: backup credentials not configured; no production SQL mutation or migration has been performed. A previous main CI run failed; its logs were unavailable, so release acceptance uses fresh independent checks rather than treating that run as passed.

Release checks (clean checkout, 2026-10-16): npm ci passed with zero reported vulnerabilities; lint, generated-route typecheck, 231 local tests, formatting, production build and nine public Playwright tests passed. No production/test credentials were present in that checkout. Backup helper: `node scripts/backup-production.mjs`; it validates the production target, keeps credentials out of command arguments/logs, writes a restricted ignored archive and validates pg_restore catalog. Database migration remains blocked until the connection is configured and backup succeeds.
