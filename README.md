# One ODC

**Every space. One vision.** The project workspace for Opulence Design Concept.

Branding and Phase 1 implement persistent authentication, five roles, BDM leads, review, atomic project conversion and personnel assignments in the existing Next.js application. See [verification](docs/verification.md) for the distinction between executed tests and pending human sign-in.

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3001/login. The configured local workspace uses the existing One ODC Supabase project `qflmicucvbjfrjtndjgu`. `/dashboard` reads real scoped records; `/demo` remains entirely fictional. The brand board is at `/branding/index.html`.

## Supabase setup

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. These are public client configuration. Never prefix a secret key with `NEXT_PUBLIC_`.
2. Apply all `supabase/migrations/*.sql` in timestamp order to a fresh environment. The four baseline migrations are already applied to the existing One ODC main/production project; do not reapply them there. Two completion migrations are currently staging-only; see the rollout section. Staging has its own recorded version mapping.
3. Disable public signup in Authentication → Sign In / Providers. Already saved and verified for One ODC. New Auth users receive inactive profiles regardless of editable metadata.
4. Set Authentication → URL Configuration Site URL to `http://127.0.0.1:3001`, and add exact redirect `http://127.0.0.1:3001/auth/confirm`. Both are already saved for local testing. Before team invitations, replace these with the hosted HTTPS application origin and callback, and update `NEXT_PUBLIC_APP_URL`.
5. Authentication → Users → Send invitation creates an inactive account. An active System Administrator assigns role and activation in `/dashboard/users`. The first administrator invitation was sent to `paulluiser@gmail.com`; its profile was activated through a guarded, audited bootstrap. The recipient still needs to accept and set their own password.
6. For invitations directly inside One ODC, set server-only `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_APP_URL`, then restart. The secret is currently absent; the invitation form explicitly reports this. Existing account management does not require that secret. Never expose or commit it.
7. Default Supabase invitation emails are supported through a client fragment exchange that clears the URL, verifies identity, writes SSR cookies and opens password setup. Optional custom SMTP can use `supabase/templates/invite.html`, whose link uses `/auth/confirm?token_hash=…&type=invite`. Supabase's current free email service locks template customization behind SMTP or an upgrade. Custom SMTP is also needed for dependable delivery to team addresses outside the provider's default-mail restrictions.

Use separate projects for future development/staging/production. The existing project is labeled main/production; only the explicitly authorized One ODC project was changed, not `project-tracker-dev`. Hosted Auth settings and the initial-admin bootstrap are operational configuration, separate from schema migrations.

## Delivered workflow

- BDM saves private incomplete drafts, submits validated requests, responds to returns and sees own lead history and calendar-day age.
- Lead Designer or System Administrator accepts, returns or rejects with required remarks. Acceptance locks the lead and atomically creates a unique originating Project, memberships, assignment history, audit and notifications. Retrying acceptance returns the same Project.
- Primary/supporting Designers are assigned; Lead Designers may self-assign. Ops assignment is optional initially. Reassignment of a Closed project cannot remove its final Ops Admin. The future commercial-close transaction must enforce the same prerequisite.
- All mutations derive the actor from verified Auth identity and active database profile. No direct client business writes are granted. Ops receives a limited project preview and cannot read leads, origins, assignment history or team details.
- Attachment selectors persist metadata only, explicitly **Not uploaded**; no file bytes or fabricated Spaces are saved. User-facing Supabase Storage uploads, Spaces, quotations, finance, commercial-close and operational workflows remain subsequent work.
- Notifications persist and refresh through normal page queries; there is no Realtime subscription or daily grouping yet.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run format:check
```

The 47 unit/PostgreSQL integration tests execute real migration/RLS/RPC code in PGlite with a test-only Auth identity shim. They do not establish real GoTrue sign-in; the separate live suite now verifies it in staging. Six browser tests cover public/demo behavior, protected routes, invitation failure handling and shared workflow component reflow. Separate authenticated staging tests now cover five roles via API and BDM/Lead/Ops UI; broader browser/accessibility acceptance remains a release gate.

The supported Webpack production build avoids this host's restricted Turbopack internal port. CI installs the matching Playwright Chromium; local checks used the available executable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Assets and deployment

`public/brand/` contains reusable identity assets and tokens. `docs/company-background.md` contains sourced company research; `docs/design-system.md` records visual guidance. Architecture, permissions, data model, traceability and pending decisions are in `docs/`.

Vercel configuration and GitHub Actions CI are present. No remote repository, Vercel site or SMTP service was provisioned. The private Supabase Storage bucket and policies are applied; authenticated transfers remain unverified. Deploy to a hosted HTTPS staging origin, configure its Supabase settings and secrets, then complete authenticated acceptance tests before inviting the team.

## Supabase Storage change

The approved [PRD storage amendment](docs/prd-storage-amendment.md) replaces the original storage choice without changing business requirements. See [storage architecture and rollout](docs/storage-architecture.md). The private `one-odc-attachments` bucket and attachment/version metadata tables are applied through `20261013080433_private_attachments.sql`. No storage-specific credential is needed; the provider uses the existing Supabase URL, publishable key and user session. Removed four unused Google OAuth/Drive variables from `.env.example`; there were no Google integration packages to remove.

The provider supports reserved immutable UUID paths, direct TUS transfers, size-verified completion, 60-second signed downloads, replacement versions and audited archive/restore. Saved-draft upload UI is implemented and verified in staging, gated for production rollout. Legacy metadata-only selections remain Not uploaded; real uploaded versions are displayed separately. The mandatory-real-file gate remains an acceptance decision.

Current bucket/local limit is 50 MiB (52,428,800 bytes), compatible with the project's Free plan ceiling. The target is 100 MiB (104,857,600 bytes, following the existing PRD implementation convention). This requires a suitable paid plan, setting the global Storage limit to at least that value, then increasing the bucket/local configuration. Existing per-file app validation still represents the target and does not promise that size can upload today. [Supabase limits](https://supabase.com/docs/guides/storage/uploads/file-limits).

Next: complete production rollout and remaining boundary/SMTP/file-gate acceptance; the staging Phase 1 and saved-draft transfer lifecycle now pass. No file bytes should pass through Next.js/Vercel request bodies.

## Completed Phase 1 staging verification

[Live verification report](docs/phase1-live-verification.md) supersedes earlier pending-auth notes above. Eight real-session API tests and three authenticated browser tests verify the Phase 1 lifecycle, concurrent conversion, role restrictions, private small/13 MiB uploads and interrupted-PATCH recovery. The saved-draft attachment panel is enabled in authorized staging using `ONE_ODC_ATTACHMENTS_ENABLED=true`.

Production rollout remains pending: review/apply `20261013085045_phase1_file_limit.sql` and `20261013090652_attachment_parent_locks.sql`, then enable that server flag. The default is false. Cap remains 50 MiB. `.env.local` was preserved; `node scripts/staging-dev.mjs` runs the staging app on port 3002. Credentials/keys for reproducible `npm run test:live` and `npm run test:staging:browser` are in ignored `.env.verification`; never commit or paste it. SMTP delivery, maximum-boundary/load/expiry/reload acceptance and the mandatory-real-file gate remain pending.
