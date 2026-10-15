# Phase 2 acceptance — staging only

13 October 2026, Asia/Manila. Final checkpoint passed. Production schema, feature flags, configuration, users and deployment are unchanged.

## Verified scope

- Actual BDM draft/file upload/archive/restore/submission → Lead acceptance → one Project → primary/support Designer assignment → independent Space → Designer submission → Lead-approved completion → live progress, activity and BDM monitoring. The same browser record survives refresh and four role-session changes.
- Return/clarification/resubmission/rejection, concurrent acceptance and its notification idempotency; bulk assignment, duplicate Space names, completion/revision/cancellation, deadline history, Hold/Resume, cancellation preservation and completed-cycle Reopen are covered by the retained tests.
- Real-JWT permissions for all five roles, other BDM/unassigned-project denial, cross-parent Space/activity bindings, restricted pre-close Ops, permitted post-close Ops, unauthorized status changes/direct writes/file requests/signed-URL issuance, current-session deactivation and immutable history. Dedicated test account access is restored in `finally`.
- Equal-weight progress/exclusions/N/A, calendar boundaries including Manila midnight and DST, frozen historical ages, separate holds/revisions and correction history have SQL/calculation tests.

## Defects fixed

Login artwork and brand endorsement contrast; semantic theme group; explicit select/textarea/summary focus rings; required-reason validation before Project confirmation; real pending text in confirmation; Space cancellation now requires an accessible confirmation; mobile navigation now traps focus, hides background controls and returns focus on Escape. Cancelled Projects no longer offer Space mutations, and held Projects no longer offer blocked design transitions; stale requests receive specific errors.

## Accessibility evidence and limits

Pinned development-only axe checks target WCAG 2.1 A/AA. Scans cover login, all five role workspaces, directory table, expanded forms, dialogs, light/dark themes, errors and mobile. Keyboard checks cover validation focus, modal containment/Escape/return focus, form traversal and mobile navigation; real pending-state and reduced-motion CSS checks are included. Compact results: `artifacts/verification/phase2-accessibility.json`.

This is not full WCAG certification. Axe reported `aria-hidden-focus` as inconclusive on Radix's hidden modal background/focus guards and `color-contrast` on the Space cancellation dialog description. Keyboard containment is tested; manual confirmation of that description's contrast, VoiceOver/NVDA announcements, zoom/text-spacing, forced colors and representative touch-device/user assessment still require manual acceptance. Activity file-reference transfer is API-verified; its standalone download panel has not received separate browser acceptance. Route skeletons are inspected/compiled; exact slow-navigation appearance remains a manual check.

## Release blockers and Phase 3 readiness

Production migration reconciliation/review and feature enablement remain unauthorized. SMTP/mailbox delivery and invitation-form acceptance, the mandatory-real-file submission decision, full 50 MiB boundary/expiry/offline/load acceptance, previews/scanning and broader file associations remain pending. Current cap is **50 MiB**, with no 100 MB claim. Notifications have acceptance-retry deduplication; general digests/deduplication remain deferred. Financial modules are absent, so payment/financial workflow access is not claimed tested. Commercial Close and Operational Completion tests use exact synthetic seeded preconditions; prerequisite workflows remain deferred.

Phase 3 staging development can proceed; production release and full accessibility sign-off remain blocked by the items above. Cancelled Projects are not restored by Reopen; Reopen starts a new cycle only after operational completion.

## Final results

- Local unit/PostgreSQL integration: **76 passed**.
- Real staging API/security: **12 passed** across four test files.
- Public/demo browser: **6 passed**; authenticated staging browser: **8 passed**.
- WCAG-tagged axe scans: **22 states, zero detected violations**; two inconclusive rule types retained for manual review above.
- Lint, typechecking, formatting and production build: **passed**. All **21** One ODC tables have RLS enabled.
- No production mutation, migration, feature enablement or deployment. No Phase 2D schema migration was required.

Commands: `npm run check`, `npm run test:live`, `npm run test:e2e`, `npm run test:staging:browser`, `npm run format:check`. Existing local Chromium override is documented in the condensed context. Initial targeted scans exposed the defects above; interrupted browser-network runs were rerun, and the final full checkpoint passed.
