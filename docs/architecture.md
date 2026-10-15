# Architecture

One ODC retains Next.js App Router, React, strict TypeScript, Tailwind, local Inter, Lucide, Radix and the original Deep Blue identity. Supabase provides PostgreSQL/Auth. Vercel remains the intended host. Dependencies are pinned with a lockfile.

## Application boundaries

- `/login` uses Zod and a real server-side Supabase password action. Successful sign-in requires an active recognized profile and a recorded application audit; failure never creates a demo session.
- `/dashboard` and every nested action independently validate `auth.getUser()` and a current active profile. Role-specific actions additionally call `requireRole`. RLS independently scopes all reads; RPCs validate identity, role, state and input again.
- `/dashboard/leads` provides scoped filters/pagination, draft creation, details, submissions and review history. `/dashboard/projects` provides scoped pipeline and team/assignment history. `/dashboard/users` is administrator-only; `/dashboard/notifications` reads recipient-only persisted notices.
- `/auth/confirm` verifies invitation/recovery token hashes server-side. Default provider emails return token fragments to the root or callback; `InvitationLanding` clears them from the URL, establishes SSR cookies with Supabase, verifies `getUser`, and navigates only to fixed password setup. Invalid/expired callbacks fail closed. Passwords are handled by Supabase Auth only.
- `src/proxy.ts` refreshes Auth cookies for protected/login/Auth routes. Protected responses are private/no-store. `src/lib/workspace-session.ts` centralizes the active profile gate; React caching is per request.
- `/demo` remains public fictional fixtures. It never supplies a protected-page fallback or business mutations.
- `src/lib/phase1.ts` holds pure validation, typed records and Manila calendar aging. `src/components/lead-fields.tsx` holds shared presentational fields used by production forms and layout tests.

## Database transactions

Twelve public tables have RLS, authenticated SELECT grants, and no direct client business-write grants. Fourteen public security-invoker RPC wrappers delegate to private, tightly granted implementations with fixed empty search paths. Privileged implementations derive `auth.uid()` and role from the current active profile; editable Auth metadata provides names only.

`save_lead` locks the current record, verifies its optimistic version and BDM ownership, validates payload and metadata, checks scoped duplicates and records an immutable full snapshot on submission. Return/resubmit preserves the original submission timestamp and all earlier snapshots.

`review_lead` locks the lead. A unique origin link plus one review per submission prevents duplicate conversion. Project, origin, memberships, assignment history, review, audit and notifications commit atomically. An Accepted retry returns the existing Project. Assignment validation shares locks on active personnel; reassignments serialize on the Project and preserve before/after history. Stale form updates fail with reload guidance.

Role/activation updates use administrator checks, an advisory transaction lock and append-only audit. Administrators cannot deactivate or demote themselves. Current profile roles are checked for membership reads, so stale memberships do not widen access after a role change. Inactive tokens cannot read business data or invoke workflow RPCs even before JWT expiry.

Inviting through the application requires an optional server-only secret. The user's session records the request and role assignment; Auth invitation is an external operation and cannot share the PostgreSQL transaction. If delivery succeeds but activation fails, the UI explicitly reports the partial outcome and provides inactive-account recovery. Provider Auth audit logs remain authoritative for password and session events; application security events are a separate allowlisted actor-bound log.

## Deferred boundaries and verification

Supabase Storage now has a private bucket, attachment/version metadata, project/lead-scoped RLS, reservation/completion/archive RPCs and a resumable provider. See `storage-architecture.md`. Legacy lead selections remain metadata-only (`not_uploaded`); the new saved-draft panel uses verified relational versions when its server flag is enabled. Spaces, quotations, financial data, closure and operations must add dedicated scoped tables/RPCs. Ops queries intentionally stop at safe project columns before fetching any origins or history. No Realtime subscription is claimed.

PGlite tests execute the migrations, PostgreSQL transactions and RLS using an Auth shim. Hosted migrations, RLS/grants and advisors were checked on One ODC. Real invitation-token/password and five-role API verification now pass in staging; email delivery and full production acceptance remain pending. See `verification.md`.

[Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [implicit email flow](https://supabase.com/docs/guides/auth/sessions/implicit-flow), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and the current changelog were checked during implementation. Build uses supported `next build --webpack`; development uses port 3001 to avoid another local app on port 3000.

The storage change and its exact rollout boundaries are authoritative in `prd-storage-amendment.md`. The provider abstraction is retained; mutable filenames are display metadata rather than object identity. Download URLs expire after 60 seconds. Preview and future entity associations are prepared in the rollout plan, not exposed as completed features.

## Phase 1 verification completion

Real password-session and Storage verification now pass in authorized staging; see `phase1-live-verification.md`. Saved Lead drafts can use the new private attachment panel with genuine TUS progress/retry, downloads and archive/restore. Upload UI is controlled by server-only `ONE_ODC_ATTACHMENTS_ENABLED`; production defaults off until its two new migrations are deployed. Test previews keep production configuration intact and strip credentials/secret keys before spawning Next.js.

The new save RPC blocks active pending uploads and snapshots ready attachment version IDs/sizes. Reservation/archive lock the parent before the attachment and recheck permission after waiting, avoiding races with submission. The provider's asynchronous resume-lookup pause race is fixed. Signed-link UI lifetime is managed by an effect and the provider still enforces a 60-second Storage capability.
